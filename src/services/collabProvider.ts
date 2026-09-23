import * as Y from 'yjs';
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
} from 'y-protocols/awareness';
import { Socket } from 'socket.io-client';

export function getDeterministicDocId(
  roomId: string,
  filePath: string,
  projectId?: string
): string {
  const normPath = (filePath || 'untitled').replace(/^\/+/, '');
  const proj = projectId || roomId;
  return `room:${roomId}:project:${proj}:file:${normPath}`;
}

export interface CollabUser {
  name: string;
  color: string;
  activeFile?: string;
}

export class CollabDocSession {
  public doc: Y.Doc;
  public ytext: Y.Text;
  public awareness: Awareness;
  public undoManager: Y.UndoManager;
  public docId: string;
  public roomId: string;
  public isSynced = false;

  private socket: Socket;
  private isDestroyed = false;
  private onSyncCallbacks: Array<() => void> = [];

  // Handlers for socket cleanup
  private handleSyncStep2: (data: { docId: string; update: number[] }) => void;
  private handleUpdate: (data: { docId: string; update: number[] }) => void;
  private handleAwareness: (data: { docId: string; update: number[] }) => void;

  constructor(
    roomId: string,
    docId: string,
    socket: Socket,
    initialContent?: string,
    user?: CollabUser
  ) {
    this.roomId = roomId;
    this.docId = docId;
    this.socket = socket;

    this.doc = new Y.Doc();
    this.ytext = this.doc.getText('codemirror');
    this.awareness = new Awareness(this.doc);
    this.undoManager = new Y.UndoManager(this.ytext);

    if (user) {
      this.awareness.setLocalStateField('user', {
        name: user.name || 'Collaborator',
        color: user.color || '#38bdf8',
        activeFile: user.activeFile || '',
      });
    }

    // 1. Listen for local Y.Doc updates and send to server
    this.doc.on('update', (update: Uint8Array, origin: any) => {
      if (origin !== 'remote' && !this.isDestroyed) {
        this.socket.emit('yjs-update', {
          roomId: this.roomId,
          docId: this.docId,
          update: Array.from(update),
        });
      }
    });

    // 2. Listen for local awareness updates (cursor/selection) and send to server
    this.awareness.on(
      'update',
      ({ added, updated, removed }: any, origin: any) => {
        if (origin !== 'remote' && !this.isDestroyed) {
          const changedClients = added.concat(updated).concat(removed);
          const update = encodeAwarenessUpdate(this.awareness, changedClients);
          this.socket.emit('yjs-awareness', {
            roomId: this.roomId,
            docId: this.docId,
            update: Array.from(update),
          });
        }
      }
    );

    // 3. Socket event listeners
    this.handleSyncStep2 = ({ docId, update }) => {
      if (docId === this.docId && !this.isDestroyed && update) {
        Y.applyUpdate(this.doc, new Uint8Array(update), 'remote');
        // Safety guard: if remote doc was completely empty but we have local file content, seed it
        if (this.ytext.length === 0 && initialContent && initialContent.trim().length > 0) {
          this.doc.transact(() => {
            this.ytext.insert(0, initialContent);
          });
        }
        this.isSynced = true;
        this.onSyncCallbacks.forEach((cb) => cb());
        this.onSyncCallbacks = [];
      }
    };

    this.handleUpdate = ({ docId, update }) => {
      if (docId === this.docId && !this.isDestroyed && update) {
        Y.applyUpdate(this.doc, new Uint8Array(update), 'remote');
      }
    };

    this.handleAwareness = ({ docId, update }) => {
      if (docId === this.docId && !this.isDestroyed && update) {
        applyAwarenessUpdate(this.awareness, new Uint8Array(update), 'remote');
      }
    };

    this.socket.on('yjs-sync-step-2', this.handleSyncStep2);
    this.socket.on('yjs-update', this.handleUpdate);
    this.socket.on('yjs-awareness', this.handleAwareness);

    // 4. Request server document state
    const stateVector = Y.encodeStateVector(this.doc);
    this.socket.emit('yjs-sync-step-1', {
      roomId: this.roomId,
      docId: this.docId,
      stateVector: Array.from(stateVector),
      initialContent: initialContent || '',
    });

    // 5. Fallback timer if network/server is delayed: never leave document in empty/un-synced limbo
    setTimeout(() => {
      if (!this.isSynced && !this.isDestroyed) {
        if (this.ytext.length === 0 && initialContent && initialContent.trim().length > 0) {
          this.doc.transact(() => {
            this.ytext.insert(0, initialContent);
          });
        }
        this.isSynced = true;
        this.onSyncCallbacks.forEach((cb) => cb());
        this.onSyncCallbacks = [];
      }
    }, 500);
  }

  public setUser(user: CollabUser) {
    if (!this.isDestroyed) {
      this.awareness.setLocalStateField('user', {
        name: user.name,
        color: user.color,
        activeFile: user.activeFile,
      });
    }
  }

  public onSynced(cb: () => void) {
    if (this.isSynced) {
      cb();
    } else {
      this.onSyncCallbacks.push(cb);
    }
  }

  public destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    this.socket.off('yjs-sync-step-2', this.handleSyncStep2);
    this.socket.off('yjs-update', this.handleUpdate);
    this.socket.off('yjs-awareness', this.handleAwareness);

    this.awareness.destroy();
    this.doc.destroy();
  }
}
