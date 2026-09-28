declare module 'y-leveldb' {
  import type * as Y from 'yjs';
  export class LeveldbPersistence {
    constructor(location: string);
    getYDoc(name: string): Promise<Y.Doc>;
    storeUpdate(name: string, update: Uint8Array): Promise<number>;
    clearDocument(name: string): Promise<void>;
    destroy(): Promise<void>;
  }
}
