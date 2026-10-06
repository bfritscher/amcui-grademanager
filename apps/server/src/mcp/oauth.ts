import {randomBytes, createHash, randomUUID} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {BlockList} from 'node:net';
import {get} from 'node:https';
import type {Response} from 'express';
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type {OAuthRegisteredClientsStore} from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type {AuthInfo} from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  OAuthClientMetadataSchema,
  type OAuthClientInformationFull,
  type OAuthTokens,
  type OAuthTokenRevocationRequest,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import {
  InvalidGrantError,
  InvalidTokenError,
  InvalidScopeError,
  InvalidClientMetadataError,
  InvalidTargetError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';

export interface OAuthStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, seconds: number): Promise<void>;
  // Replace only the expected, still-live value, preserving its expiration.
  compareAndSet(key: string, expected: string, value: string): Promise<boolean>;
  take(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
  addMember(key: string, value: string): Promise<void>;
  members(key: string): Promise<string[]>;
}
export interface Grant {
  id: string;
  username: string;
  clientId: string;
  clientName: string;
  projects: string[];
  scopes: string[];
  expiresAt: number;
}
export class GrantAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
interface Pending {
  clientId: string;
  clientName: string;
  params: Omit<AuthorizationParams, 'resource'> & {resource: string};
}
interface CodeRecord extends Pending {
  grantId: string;
}
interface TokenRecord {
  grantId: string;
  clientId: string;
  scopes: string[];
  expiresAt: number;
  resource: string;
}
const lifetime = 30 * 24 * 3600;
const now = () => Math.floor(Date.now() / 1000);
const secret = () => randomBytes(32).toString('base64url');
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');

// Pin a validated public DNS result to the HTTPS request. Do not follow redirects,
// trust host-supplied metadata, fetch private IPs, or accept unlimited responses.
async function clientDocument(
  clientId: string,
): Promise<OAuthClientInformationFull> {
  const url = new URL(clientId);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    (url.port && url.port !== '443')
  )
    throw new InvalidClientMetadataError('Invalid metadata URL');
  const addresses = await lookup(url.hostname, {all: true});
  const blocked = new BlockList();
  for (const [address, prefix] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ] as const)
    blocked.addSubnet(address, prefix, 'ipv4');
  const globalV6 = new BlockList();
  globalV6.addSubnet('2000::', 3, 'ipv6');
  if (
    !addresses.length ||
    addresses.some((a) =>
      a.family === 4
        ? blocked.check(a.address, 'ipv4')
        : !globalV6.check(a.address, 'ipv6'),
    )
  )
    throw new InvalidClientMetadataError(
      'Metadata URL must resolve to a public address',
    );
  const address = addresses[0];
  const body = await new Promise<string>((resolve, reject) => {
    const request = get(
      url,
      {
        // A fixed family prevents Node's automatic dual-stack lookup from
        // asking the pinned single-address callback for an address array.
        family: address.family,
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error('Metadata fetch failed'));
          return;
        }
        let data = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          data += chunk;
          if (data.length > 65_536)
            request.destroy(new Error('Metadata too large'));
        });
        response.on('end', () => resolve(data));
        response.on('error', reject);
      },
    );
    request.setTimeout(5000, () =>
      request.destroy(new Error('Metadata timeout')),
    );
    request.on('error', reject);
  });
  const document = JSON.parse(body);
  if (document.client_id !== clientId)
    throw new InvalidClientMetadataError('Metadata client ID mismatch');
  const metadata = OAuthClientMetadataSchema.parse(document);
  return {...metadata, client_id: clientId, token_endpoint_auth_method: 'none'};
}

export class ExamOAuth implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore;
  constructor(
    readonly storage: OAuthStorage,
    readonly resource: string,
    private webUrl: string,
    private projectList: (username: string) => Promise<string[]>,
    clients: OAuthClientInformationFull[] = [],
    private accountActive: (username: string) => Promise<boolean> = async () =>
      true,
  ) {
    this.clientsStore = {
      getClient: async (id) => {
        const predefined = clients.find((c) => c.client_id === id);
        if (predefined) return predefined;
        const cached = await this.read<OAuthClientInformationFull>(
          `client:${digest(id)}`,
        );
        if (cached) return cached;
        if (!id.startsWith('https://')) return undefined;
        const client = await clientDocument(id);
        this.checkClient(client);
        await this.write(`client:${digest(id)}`, client, 3600);
        return client;
      },
      registerClient: async (metadata) => {
        const client = {
          ...metadata,
          client_id: randomUUID(),
          client_id_issued_at: now(),
        };
        this.checkClient(client);
        await this.write(
          `client:${digest(client.client_id)}`,
          client,
          lifetime,
        );
        return client;
      },
    };
  }
  private checkClient(client: OAuthClientInformationFull) {
    if (!client.redirect_uris.length || client.redirect_uris.length > 10)
      throw new InvalidClientMetadataError('Invalid redirect URIs');
    for (const value of client.redirect_uris) {
      const url = new URL(value);
      if (
        url.hash ||
        url.username ||
        url.password ||
        (url.protocol !== 'https:' &&
          !(
            url.protocol === 'http:' &&
            ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
          ))
      )
        throw new InvalidClientMetadataError(
          'HTTPS or loopback redirect URI required',
        );
    }
  }
  private key(key: string) {
    return `mcp:oauth:${key}`;
  }
  private async read<T>(key: string): Promise<T | null> {
    const value = await this.storage.get(this.key(key));
    return value ? JSON.parse(value) : null;
  }
  private write(key: string, value: unknown, ttl: number) {
    return this.storage.set(this.key(key), JSON.stringify(value), ttl);
  }
  private async consume<T>(key: string): Promise<T | null> {
    const value = await this.storage.take(this.key(key));
    return value ? JSON.parse(value) : null;
  }
  private checkResource(resource?: URL) {
    if (resource?.href !== this.resource)
      throw new InvalidTargetError('Resource must identify this MCP endpoint');
  }
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    this.checkResource(params.resource);
    const scopes = params.scopes?.length
      ? params.scopes
      : ['exam:read', 'exam:write'];
    if (scopes.some((s) => !['exam:read', 'exam:write'].includes(s)))
      throw new InvalidScopeError('Unsupported scope');
    if (!client.redirect_uris.includes(params.redirectUri))
      throw new InvalidClientMetadataError('Redirect URI mismatch');
    const ticket = secret();
    await this.write(
      `pending:${digest(ticket)}`,
      {
        clientId: client.client_id,
        clientName: client.client_name || client.client_id,
        params: {...params, scopes, resource: this.resource},
      },
      600,
    );
    const location = new URL(
      'mcp/authorize',
      this.webUrl.endsWith('/') ? this.webUrl : this.webUrl + '/',
    );
    location.searchParams.set('request', ticket);
    res.redirect(location.href);
  }
  async pending(ticket: string, username: string) {
    const pending = await this.read<Pending>(`pending:${digest(ticket)}`);
    if (!pending) throw new InvalidGrantError('Authorization request expired');
    return {
      clientName: pending.clientName,
      scopes: pending.params.scopes,
      projects: await this.projectList(username),
    };
  }
  async consent(
    ticket: string,
    username: string,
    projects: string[],
    allow: boolean,
  ) {
    const pending = await this.read<Pending>(`pending:${digest(ticket)}`);
    if (!pending) throw new InvalidGrantError('Authorization request expired');
    const available = await this.projectList(username);
    if (
      allow &&
      ((!projects.length && !pending.params.scopes?.includes('exam:write')) ||
        projects.length > 200 ||
        projects.some((p) => !available.includes(p)))
    )
      throw new InvalidGrantError('Select accessible projects');
    if (!(await this.consume(`pending:${digest(ticket)}`)))
      throw new InvalidGrantError('Authorization request already used');
    const redirect = new URL(pending.params.redirectUri);
    if (pending.params.state !== undefined)
      redirect.searchParams.set('state', pending.params.state);
    if (!allow) {
      redirect.searchParams.set('error', 'access_denied');
      return redirect.href;
    }
    const grant: Grant = {
      id: randomUUID(),
      username,
      clientId: pending.clientId,
      clientName: pending.clientName,
      projects: [...new Set(projects)],
      scopes: pending.params.scopes || [],
      expiresAt: now() + lifetime,
    };
    await this.write(`grant:${grant.id}`, grant, lifetime);
    await this.storage.addMember(this.key(`user:${username}`), grant.id);
    const code = secret();
    await this.write(
      `code:${digest(code)}`,
      {...pending, grantId: grant.id},
      120,
    );
    redirect.searchParams.set('code', code);
    return redirect.href;
  }
  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
  ) {
    const record = await this.read<CodeRecord>(`code:${digest(code)}`);
    if (!record || record.clientId !== client.client_id)
      throw new InvalidGrantError('Invalid authorization code');
    return record.params.codeChallenge;
  }
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    verifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    this.checkResource(resource);
    const record = await this.read<CodeRecord>(`code:${digest(code)}`);
    if (
      !record ||
      record.clientId !== client.client_id ||
      record.params.redirectUri !== redirectUri
    )
      throw new InvalidGrantError('Invalid authorization code');
    // The SDK validates PKCE before invoking this method; also validate when directly supplied.
    if (
      verifier &&
      createHash('sha256').update(verifier).digest('base64url') !==
        record.params.codeChallenge
    )
      throw new InvalidGrantError('Invalid verifier');
    if (!(await this.consume(`code:${digest(code)}`)))
      throw new InvalidGrantError('Code already used');
    return this.issue(record.grantId, record.params.scopes || []);
  }
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    token: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    this.checkResource(resource);
    const record = await this.read<TokenRecord>(`refresh:${digest(token)}`);
    if (
      !record ||
      record.clientId !== client.client_id ||
      record.expiresAt <= now()
    )
      throw new InvalidGrantError('Invalid refresh token');
    if (scopes?.some((s) => !record.scopes.includes(s)))
      throw new InvalidScopeError('Cannot expand scopes');
    if (!(await this.consume(`refresh:${digest(token)}`)))
      throw new InvalidGrantError('Refresh token already used');
    return this.issue(record.grantId, scopes || record.scopes);
  }
  private async issue(grantId: string, scopes: string[]): Promise<OAuthTokens> {
    const grant = await this.read<Grant>(`grant:${grantId}`);
    if (
      !grant ||
      grant.expiresAt <= now() ||
      !(await this.accountActive(grant.username))
    )
      throw new InvalidGrantError('Grant expired or revoked');
    const access = secret(),
      refresh = secret();
    const expires = Math.min(900, grant.expiresAt - now());
    const record: TokenRecord = {
      grantId,
      clientId: grant.clientId,
      scopes,
      expiresAt: now() + expires,
      resource: this.resource,
    };
    await this.write(`access:${digest(access)}`, record, expires);
    await this.write(
      `refresh:${digest(refresh)}`,
      {...record, expiresAt: grant.expiresAt},
      grant.expiresAt - now(),
    );
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: 'Bearer',
      expires_in: expires,
      scope: scopes.join(' '),
    };
  }
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const record = await this.read<TokenRecord>(`access:${digest(token)}`);
    const grant = record && (await this.read<Grant>(`grant:${record.grantId}`));
    if (
      !record ||
      !grant ||
      record.expiresAt <= now() ||
      grant.expiresAt <= now() ||
      record.resource !== this.resource ||
      !(await this.accountActive(grant.username))
    )
      throw new InvalidTokenError('Token expired or revoked');
    return {
      token,
      clientId: grant.clientId,
      scopes: record.scopes,
      expiresAt: record.expiresAt,
      resource: new URL(this.resource),
      extra: {
        username: grant.username,
        projects: grant.projects,
        grantId: grant.id,
      },
    };
  }
  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ) {
    const hash = digest(request.token);
    const record =
      (await this.read<TokenRecord>(`access:${hash}`)) ||
      (await this.read<TokenRecord>(`refresh:${hash}`));
    if (record?.clientId === client.client_id)
      await this.storage.delete(this.key(`grant:${record.grantId}`));
  }
  async grants(username: string): Promise<Grant[]> {
    const ids = await this.storage.members(this.key(`user:${username}`));
    const grants = await Promise.all(
      ids.map((id) => this.read<Grant>(`grant:${id}`)),
    );
    return grants.filter(
      (g): g is Grant => !!g && g.username === username && g.expiresAt > now(),
    );
  }
  private async ownedGrant(username: string, id: string) {
    const stored = await this.storage.get(this.key(`grant:${id}`));
    const grant: Grant | null = stored ? JSON.parse(stored) : null;
    if (!grant || grant.username !== username || grant.expiresAt <= now())
      throw new GrantAccessError(
        'This connection has expired or been revoked. Reconnect your editor to continue.',
        404,
      );
    return {grant, stored: stored!};
  }
  async grantProjects(username: string, id: string) {
    const {grant} = await this.ownedGrant(username, id);
    return {grant, availableProjects: await this.projectList(username)};
  }
  async projectCreationGrant(username: string, id: string, clientId: string) {
    const {grant} = await this.ownedGrant(username, id);
    if (grant.clientId !== clientId || !grant.scopes.includes('exam:write'))
      throw new GrantAccessError(
        'FORBIDDEN: project creation requires editing access.',
        403,
      );
    if (grant.projects.length >= 200)
      throw new GrantAccessError(
        'This connection already has 200 projects. Remove a project in your profile first.',
        400,
      );
    return grant;
  }
  async updateGrantProjects(username: string, id: string, projects: string[]) {
    const {grant, stored} = await this.ownedGrant(username, id);
    if (
      (!projects.length && !grant.scopes.includes('exam:write')) ||
      projects.length > 200
    )
      throw new GrantAccessError(
        grant.scopes.includes('exam:write')
          ? 'Select at most 200 projects.'
          : 'Select between 1 and 200 projects.',
        400,
      );
    const available = await this.projectList(username);
    if (projects.some((project) => !available.includes(project)))
      throw new GrantAccessError(
        'Some selected projects are no longer accessible. Reopen Edit projects and try again.',
        403,
      );
    return this.saveGrantProjects(grant, stored, [...new Set(projects)]);
  }
  async addGrantProject(username: string, id: string, project: string) {
    const {grant, stored} = await this.ownedGrant(username, id);
    if (!(await this.projectList(username)).includes(project))
      throw new GrantAccessError('This project is no longer accessible.', 403);
    if (grant.projects.includes(project)) return grant;
    if (grant.projects.length >= 200)
      throw new GrantAccessError(
        'This connection already has 200 projects. Remove a project in your profile first.',
        400,
      );
    return this.saveGrantProjects(grant, stored, [...grant.projects, project]);
  }
  private async saveGrantProjects(
    grant: Grant,
    stored: string,
    projects: string[],
  ) {
    const updated = {...grant, projects};
    // A concurrent revoke/expiry must never be undone by saving an open picker.
    if (
      !(await this.storage.compareAndSet(
        this.key(`grant:${grant.id}`),
        stored,
        JSON.stringify(updated),
      ))
    )
      throw new GrantAccessError(
        'This connection changed or expired. Reopen Edit projects and try again.',
        409,
      );
    return updated;
  }
  async revokeGrant(username: string, id: string) {
    const grant = await this.read<Grant>(`grant:${id}`);
    if (grant?.username !== username)
      throw new InvalidGrantError('Grant not found');
    await this.storage.delete(this.key(`grant:${id}`));
  }
}
