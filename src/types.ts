export interface Client {
  socketId: string;
  userId?: string;
  username: string;
  userColor?: string;
  color?: string;
  isHost?: boolean;
  role?: 'host' | 'editor' | 'viewer';
  activeFileId?: string;
}

export interface ChatMessage {
  id: string;
  roomId?: string;
  senderId?: string;
  sender: string;
  text: string;
  timestamp: string;
  isAi?: boolean;
  userColor?: string;
}

export interface ProjectFile {
  id: string;
  roomId?: string;
  name: string;
  path: string;
  content: string;
  language: SupportedLanguage;
  isFolder: boolean;
  parentPath: string; // "" for root, or "src", etc.
  version?: number;
  updatedAt?: string;
  isDirty?: boolean;
}

export interface EditorTab {
  fileId: string;
  name: string;
  path: string;
  language: SupportedLanguage;
  isDirty?: boolean;
}

export interface CodeDelta {
  fileId: string;
  from: number;
  to: number;
  insert: string;
  version: number;
  authorId: string;
  authorName: string;
}

export interface CursorPresence {
  userId: string;
  username: string;
  userColor: string;
  fileId: string;
  line: number;
  col: number;
  ch?: number;
}

export interface Diagnostic {
  id: string;
  fileId: string;
  fileName: string;
  line: number;
  col: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface RoomInfo {
  roomId: string;
  roomname?: string;
  language: string;
  code?: string;
  participantsCount: number;
  lastUpdated?: string;
}

export interface AuthUser {
  id: string;
  username: string;
  email?: string;
  photoURL?: string;
}

export type SupportedLanguage = 
  | 'javascript' 
  | 'typescript' 
  | 'python' 
  | 'java' 
  | 'cpp' 
  | 'html' 
  | 'css'
  | 'json'
  | 'markdown'
  | 'plaintext';

export type ActivityBarView = 
  | 'explorer' 
  | 'search' 
  | 'collab' 
  | 'chat' 
  | 'video' 
  | 'settings';

export type TerminalPanelTab = 
  | 'terminal' 
  | 'output' 
  | 'problems' 
  | 'debug'
  | 'preview';

export type ConnectionStatus = 
  | 'connected' 
  | 'syncing' 
  | 'reconnecting' 
  | 'offline';
