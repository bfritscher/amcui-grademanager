import * as Y from 'yjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import * as sync from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import type {WebSocket, RawData} from 'ws';
import {
  createSection,
  putEntity,
  replaceExam,
  migrateDocument,
  readExam,
} from '@amcui/exam-core';

export interface DocumentPersistence {
  getYDoc(name: string): Promise<Y.Doc>;
  storeUpdate(name: string, update: Uint8Array): Promise<unknown>;
  clearDocument(name: string): Promise<unknown>;
}
interface Entry {
  doc: Y.Doc;
  awareness: Awareness;
  sockets: Map<WebSocket, {enqueue: (work: () => void) => void}>;
  pending: Promise<unknown>;
  users: number;
  timer?: ReturnType<typeof setTimeout>;
}
export class ExamDocuments {
  private entries = new Map<string, Promise<Entry>>();
  private locks = new Map<string, Promise<unknown>>();
  constructor(
    private persistence: DocumentPersistence | null,
    private legacy: (project: string) => Promise<unknown>,
    private idleMs = 60_000,
    private accessCheckMs = 30_000,
    private persistProject: (project: string) => Promise<boolean> = async () =>
      true,
  ) {}
  static projectName(project: string): string {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(project))
      throw new Error('INVALID_PROJECT');
    return `ws/${project}`;
  }
  private acquire(project: string): Promise<Entry> {
    const name = ExamDocuments.projectName(project);
    let entry = this.entries.get(project);
    if (!entry) {
      entry = (async () => {
        const persist =
          this.persistence && (await this.persistProject(project));
        const doc = persist
          ? await this.persistence!.getYDoc(name)
          : new Y.Doc();
        const state: Entry = {
          doc,
          awareness: new Awareness(doc),
          sockets: new Map(),
          pending: Promise.resolve(),
          users: 0,
        };
        state.awareness.setLocalState(null);
        doc.on('update', (update: Uint8Array) => {
          if (persist)
            state.pending = state.pending.then(() =>
              this.persistence!.storeUpdate(name, update),
            );
          // Keep rejection observed; flush still reports the original persistence failure.
          void state.pending.catch(() => {});
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, 0);
          sync.writeUpdate(encoder, update);
          this.broadcast(state, encoding.toUint8Array(encoder));
        });
        state.awareness.on(
          'update',
          ({
            added,
            updated,
            removed,
          }: {
            added: number[];
            updated: number[];
            removed: number[];
          }) => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 1);
            encoding.writeVarUint8Array(
              encoder,
              encodeAwarenessUpdate(state.awareness, [
                ...added,
                ...updated,
                ...removed,
              ]),
            );
            this.broadcast(state, encoding.toUint8Array(encoder));
          },
        );
        try {
          if (!doc.getMap('sections').size) {
            const snapshot = await this.legacy(project);
            if (snapshot) replaceExam(doc, snapshot, 'migration');
            else putEntity(doc, 'sections', createSection());
          }
          migrateDocument(doc);
          await state.pending;
          return state;
        } catch (error) {
          state.awareness.destroy();
          doc.destroy();
          throw error;
        }
      })();
      this.entries.set(project, entry);
      void entry.catch(() => this.entries.delete(project));
    }
    return entry;
  }
  private broadcast(entry: Entry, data: Uint8Array) {
    for (const [socket, connection] of entry.sockets)
      connection.enqueue(() => socket.send(data));
  }
  private release(project: string, entry: Entry) {
    if (!this.entries.has(project) || entry.users || entry.sockets.size) return;
    clearTimeout(entry.timer);
    entry.timer = setTimeout(async () => {
      if (entry.users || entry.sockets.size) return;
      try {
        await entry.pending;
      } catch {
        return;
      } // Keep failed state in memory for diagnosis/recovery.
      if (entry.users || entry.sockets.size) return;
      this.entries.delete(project);
      entry.awareness.destroy();
      entry.doc.destroy();
    }, this.idleMs);
    entry.timer.unref?.();
  }
  async withDocument<T>(
    project: string,
    run: (doc: Y.Doc) => T | Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(project) || Promise.resolve();
    const work = previous
      .catch(() => {})
      .then(async () => {
        const entry = await this.acquire(project);
        clearTimeout(entry.timer);
        entry.users++;
        try {
          const result = await run(entry.doc);
          await entry.pending;
          return result;
        } finally {
          entry.users--;
          this.release(project, entry);
        }
      });
    this.locks.set(project, work);
    try {
      return await work;
    } finally {
      if (this.locks.get(project) === work) this.locks.delete(project);
    }
  }
  async connect(
    project: string,
    socket: WebSocket,
    authorized: () => Promise<boolean>,
    onEdit: () => Promise<void> = async () => {},
  ): Promise<void> {
    const early: RawData[] = [];
    let earlyBytes = 0;
    const buffer = (data: RawData) => {
      earlyBytes += Buffer.isBuffer(data)
        ? data.length
        : data instanceof ArrayBuffer
          ? data.byteLength
          : data.reduce((n, part) => n + part.length, 0);
      if (early.length >= 100 || earlyBytes > 5 * 1024 * 1024)
        socket.close(1008, 'Sync queue full');
      else early.push(data);
    };
    socket.on('message', buffer);
    const entry = await this.acquire(project);
    if (socket.readyState !== 1) {
      this.release(project, entry);
      return;
    }
    clearTimeout(entry.timer);
    const ids = new Set<number>();
    let pending = Promise.resolve();
    const enqueue = (work: () => void) => {
      pending = pending
        .then(async () => {
          if (socket.readyState !== 1) return;
          // Recheck before every outgoing message as well as incoming edits.
          let allowed = false;
          try {
            allowed = await authorized();
          } catch {
            /* Fail closed. */
          }
          if (!allowed) {
            socket.close(1008, 'Access revoked');
            return;
          }
          if (socket.readyState === 1) work();
        })
        .catch(() => socket.close(1008, 'Invalid sync message'));
    };
    entry.sockets.set(socket, {enqueue});
    const humanUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === socket) void onEdit().catch(() => {});
    };
    entry.doc.on('update', humanUpdate);
    let alive = true;
    const heartbeat = setInterval(() => {
      enqueue(() => {
        if (!alive) socket.terminate();
        else {
          alive = false;
          socket.ping();
        }
      });
    }, this.accessCheckMs);
    heartbeat.unref?.();
    socket.on('pong', () => {
      alive = true;
    });
    socket.on('message', (data) => {
      enqueue(() => {
        const decoder = decoding.createDecoder(new Uint8Array(data as Buffer));
        const type = decoding.readVarUint(decoder);
        if (type === 0) {
          const reply = encoding.createEncoder();
          encoding.writeVarUint(reply, 0);
          sync.readSyncMessage(decoder, reply, entry.doc, socket);
          if (encoding.length(reply) > 1 && socket.readyState === 1)
            socket.send(encoding.toUint8Array(reply));
        } else if (type === 1) {
          const update = decoding.readVarUint8Array(decoder);
          const awarenessDecoder = decoding.createDecoder(update);
          const count = decoding.readVarUint(awarenessDecoder);
          for (let i = 0; i < count; i++) {
            const id = decoding.readVarUint(awarenessDecoder);
            decoding.readVarUint(awarenessDecoder);
            const value = decoding.readVarString(awarenessDecoder);
            if (value !== 'null') ids.add(id);
          }
          applyAwarenessUpdate(entry.awareness, update, socket);
        }
      });
    });
    socket.off('message', buffer);
    for (const data of early) socket.emit('message', data);
    socket.on('close', () => {
      entry.doc.off('update', humanUpdate);
      clearInterval(heartbeat);
      entry.sockets.delete(socket);
      removeAwarenessStates(entry.awareness, [...ids], socket);
      void pending.finally(() => this.release(project, entry));
    });
    socket.on('error', () => socket.close());
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    sync.writeSyncStep1(encoder, entry.doc);
    enqueue(() => socket.send(encoding.toUint8Array(encoder)));
    if (entry.awareness.getStates().size) {
      const awareness = encoding.createEncoder();
      encoding.writeVarUint(awareness, 1);
      encoding.writeVarUint8Array(
        awareness,
        encodeAwarenessUpdate(entry.awareness, [
          ...entry.awareness.getStates().keys(),
        ]),
      );
      enqueue(() => socket.send(encoding.toUint8Array(awareness)));
    }
  }
  async clear(project: string) {
    ExamDocuments.projectName(project);
    await this.locks.get(project)?.catch(() => {});
    const loaded = this.entries.get(project);
    if (loaded) {
      const entry = await loaded;
      for (const socket of entry.sockets.keys())
        socket.close(1012, 'Project reset');
      await entry.pending;
      this.entries.delete(project);
      clearTimeout(entry.timer);
      entry.awareness.destroy();
      entry.doc.destroy();
    }
    // A deleted project's directory may already be gone. Never initialize it here.
    await this.persistence?.clearDocument(ExamDocuments.projectName(project));
  }
  async disconnectProject(project: string) {
    const loaded = this.entries.get(project);
    if (!loaded) return;
    const entry = await loaded;
    for (const socket of entry.sockets.keys())
      socket.close(1012, 'Project maintenance');
    await entry.pending;
  }
  async rename(
    project: string,
    destination: string,
    moveFiles: () => Promise<void>,
  ) {
    const name = ExamDocuments.projectName(destination);
    await this.withDocument(project, async (doc) => {
      const entry = await this.acquire(project);
      for (const socket of entry.sockets.keys())
        socket.close(1012, 'Project renamed');
      await entry.pending;
      const update = Y.encodeStateAsUpdate(doc);
      if (this.persistence) {
        await this.persistence.clearDocument(name);
        await this.persistence.storeUpdate(name, update);
      }
      try {
        await moveFiles();
      } catch (error) {
        await this.persistence?.clearDocument(name);
        throw error;
      }
      if (!this.persistence)
        await this.withDocument(destination, (target) =>
          replaceExam(target, readExam(doc)),
        );
      await this.persistence?.clearDocument(ExamDocuments.projectName(project));
      this.entries.delete(project);
      clearTimeout(entry.timer);
      entry.awareness.destroy();
      doc.destroy();
    });
  }
  async close() {
    for (const promise of this.entries.values()) {
      const e = await promise;
      clearTimeout(e.timer);
      for (const ws of e.sockets.keys()) ws.terminate();
      try {
        await e.pending;
      } finally {
        e.awareness.destroy();
        e.doc.destroy();
      }
    }
    this.entries.clear();
  }
}
