import * as Y from 'yjs';
import type {DocumentPersistence} from '../src/exam/documents.js';
import type {OAuthStorage} from '../src/mcp/oauth.js';
export class MemoryPersistence implements DocumentPersistence {
  data = new Map<string, Uint8Array>();
  async getYDoc(name: string) {
    const doc = new Y.Doc();
    const data = this.data.get(name);
    if (data) Y.applyUpdate(doc, data);
    return doc;
  }
  async storeUpdate(name: string, update: Uint8Array) {
    this.data.set(
      name,
      Y.mergeUpdates([
        ...(this.data.has(name) ? [this.data.get(name)!] : []),
        update,
      ]),
    );
  }
  async clearDocument(name: string) {
    this.data.delete(name);
  }
}
export class MemoryOAuth implements OAuthStorage {
  values = new Map<string, {value: string; expires: number}>();
  sets = new Map<string, Set<string>>();
  async get(key: string) {
    const entry = this.values.get(key);
    return entry && entry.expires > Date.now() ? entry.value : null;
  }
  async set(key: string, value: string, seconds: number) {
    this.values.set(key, {value, expires: Date.now() + seconds * 1000});
  }
  async compareAndSet(key: string, expected: string, value: string) {
    const entry = this.values.get(key);
    if (!entry || entry.expires <= Date.now() || entry.value !== expected)
      return false;
    this.values.set(key, {...entry, value});
    return true;
  }
  async take(key: string) {
    const entry = this.values.get(key);
    this.values.delete(key);
    return entry && entry.expires > Date.now() ? entry.value : null;
  }
  async delete(key: string) {
    this.values.delete(key);
  }
  async addMember(key: string, value: string) {
    if (!this.sets.has(key)) this.sets.set(key, new Set());
    this.sets.get(key)!.add(value);
  }
  async members(key: string) {
    return [...(this.sets.get(key) || [])];
  }
}
