import {describe, it, expect} from 'vitest';
import {createHash} from 'node:crypto';
import type {Response} from 'express';
import {ExamOAuth} from '../src/mcp/oauth.js';
import {MemoryOAuth} from './helpers.js';
const resource = 'https://exam.example/api/mcp';
const client = {
  client_id: 'client',
  client_name: 'Test Editor',
  redirect_uris: ['http://127.0.0.1/callback'],
  token_endpoint_auth_method: 'none' as const,
};
async function authorize(oauth: ExamOAuth, verifier = 'a'.repeat(50)) {
  let redirect = '';
  await oauth.authorize(
    client,
    {
      redirectUri: client.redirect_uris[0],
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
      scopes: ['exam:read', 'exam:write'],
      state: 'test-state',
      resource: new URL(resource),
    },
    {
      redirect: (value: string) => {
        redirect = value;
      },
    } as Response,
  );
  const ticket = new URL(redirect).searchParams.get('request')!;
  return {ticket, verifier};
}
describe('OAuth grants', () => {
  it('requires explicit project consent and issues renewable, separately revocable credentials', async () => {
    const store = new MemoryOAuth();
    const oauth = new ExamOAuth(
      store,
      resource,
      'https://exam.example',
      async () => ['exam'],
      [client],
    );
    const {ticket, verifier} = await authorize(oauth);
    expect((await oauth.pending(ticket, 'teacher')).projects).toEqual(['exam']);
    await expect(
      oauth.consent(ticket, 'teacher', ['unauthorized'], true),
    ).rejects.toThrow();
    const redirect = new URL(
      await oauth.consent(ticket, 'teacher', ['exam'], true),
    );
    expect(redirect.searchParams.get('state')).toBe('test-state');
    const code = redirect.searchParams.get('code')!;
    await expect(
      oauth.exchangeAuthorizationCode(
        client,
        code,
        'wrong',
        client.redirect_uris[0],
        new URL(resource),
      ),
    ).rejects.toThrow();
    const tokens = await oauth.exchangeAuthorizationCode(
      client,
      code,
      verifier,
      client.redirect_uris[0],
      new URL(resource),
    );
    const auth = await oauth.verifyAccessToken(tokens.access_token);
    expect(auth.extra?.username).toBe('teacher');
    expect(auth.extra?.projects).toEqual(['exam']);
    await expect(
      oauth.exchangeAuthorizationCode(
        client,
        code,
        verifier,
        client.redirect_uris[0],
        new URL(resource),
      ),
    ).rejects.toThrow();
    const renewed = await oauth.exchangeRefreshToken(
      client,
      tokens.refresh_token!,
      ['exam:read'],
      new URL(resource),
    );
    expect(
      (await oauth.verifyAccessToken(renewed.access_token)).scopes,
    ).toEqual(['exam:read']);
    await expect(
      oauth.exchangeRefreshToken(
        client,
        tokens.refresh_token!,
        undefined,
        new URL(resource),
      ),
    ).rejects.toThrow();
    await oauth.revokeGrant('teacher', String(auth.extra?.grantId));
    await expect(
      oauth.verifyAccessToken(tokens.access_token),
    ).rejects.toThrow();
    await expect(
      oauth.verifyAccessToken(renewed.access_token),
    ).rejects.toThrow();
  });
  it('rejects wrong resource, scope expansion, wrong redirect, expired requests and grant ownership changes', async () => {
    const store = new MemoryOAuth();
    const oauth = new ExamOAuth(
      store,
      resource,
      'https://exam.example',
      async () => ['exam'],
    );
    await expect(
      oauth.authorize(
        client,
        {
          redirectUri: client.redirect_uris[0],
          codeChallenge: 'x',
          resource: new URL('https://wrong.example'),
        },
        {} as Response,
      ),
    ).rejects.toThrow();
    const {ticket, verifier} = await authorize(oauth);
    const code = new URL(
      await oauth.consent(ticket, 'teacher', ['exam'], true),
    ).searchParams.get('code')!;
    await expect(
      oauth.exchangeAuthorizationCode(
        client,
        code,
        verifier,
        'https://attacker.example',
        new URL(resource),
      ),
    ).rejects.toThrow();
    const tokens = await oauth.exchangeAuthorizationCode(
      client,
      code,
      verifier,
      client.redirect_uris[0],
      new URL(resource),
    );
    await expect(
      oauth.exchangeRefreshToken(
        client,
        tokens.refresh_token!,
        ['admin'],
        new URL(resource),
      ),
    ).rejects.toThrow();
    const [grant] = await oauth.grants('teacher');
    await expect(oauth.revokeGrant('someone-else', grant.id)).rejects.toThrow();
    for (const entry of store.values.values()) entry.expires = 0;
    await expect(
      oauth.verifyAccessToken(tokens.access_token),
    ).rejects.toThrow();
  });
  it('denial returns the client state without issuing a grant', async () => {
    const oauth = new ExamOAuth(
      new MemoryOAuth(),
      resource,
      'https://exam.example',
      async () => ['exam'],
    );
    const {ticket} = await authorize(oauth);
    const denied = new URL(await oauth.consent(ticket, 'teacher', [], false));
    expect(denied.searchParams.get('error')).toBe('access_denied');
    expect(denied.searchParams.get('state')).toBe('test-state');
    expect(await oauth.grants('teacher')).toEqual([]);
  });
  it('refuses private metadata URLs and unsafe registration redirects', async () => {
    const oauth = new ExamOAuth(
      new MemoryOAuth(),
      resource,
      'https://exam.example',
      async () => [],
    );
    await expect(
      oauth.clientsStore.getClient('https://127.0.0.1/client.json'),
    ).rejects.toThrow('public');
    await expect(
      oauth.clientsStore.registerClient!({
        redirect_uris: ['javascript:alert(1)'],
        token_endpoint_auth_method: 'none',
      }),
    ).rejects.toThrow();
  });
});
