import React, { useState, useEffect, useRef, useCallback, useMemo, FC, MouseEvent as ReactMouseEvent, ChangeEvent as ReactChangeEvent } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Socket } from 'socket.io-client';
import toast, { Toaster } from 'react-hot-toast';
import JSZip from 'jszip';
import { initSocket } from '../socket';
import { ACTIONS } from '../action';
import { 
  Client, 
  ChatMessage, 
  ProjectFile, 
  EditorTab, 
  SupportedLanguage, 
  ActivityBarView, 
  ConnectionStatus, 
  CursorPresence, 
  Diagnostic 
} from '../types';

import { ActivityBar } from '../components/ide/ActivityBar';
import { TopMenuBar } from '../components/ide/TopMenuBar';
import { FileExplorer } from '../components/ide/FileExplorer';
import { WorkspaceSearch } from '../components/ide/WorkspaceSearch';
import { EditorTabs } from '../components/ide/EditorTabs';
import { doc, onSnapshot, updateDoc, setDoc, deleteDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { NewItemModal } from '../components/ide/NewItemModal';
import { CodeEditorView, EditorRefHandle } from '../components/ide/CodeEditorView';
import { StatusBar } from '../components/ide/StatusBar';
import { TerminalPanel } from '../components/ide/TerminalPanel';
import { CommandPalette, CommandItem } from '../components/ide/CommandPalette';
import { QuickOpenModal } from '../components/ide/QuickOpenModal';
import { FindReplaceModal } from '../components/ide/FindReplaceModal';
import { GoToLineModal } from '../components/ide/GoToLineModal';
import { ReplaceWorkspaceModal } from '../components/ide/ReplaceWorkspaceModal';
import { AIErrorFixModal } from '../components/ide/AIErrorFixModal';
import { VideoCallPanel } from '../components/ide/VideoCallPanel';
import { CollaboratorsPanel } from '../components/ide/CollaboratorsPanel';
import { ChatPanel } from '../components/ChatPanel';
import { getFileLanguage } from '../components/ide/icons';
import { useAuth } from '../context/AuthContext';
import { detectProject } from '../utils/projectDetector';
import { getDefaultProjectFiles } from '../utils/defaultFiles';
import { CollabDocSession, getDeterministicDocId } from '../services/collabProvider';
import { 
  updateRoomMetadataInFirestore,
  saveRoomToFirestore, 
  saveFilesToFirestore, 
  saveFileToFirestore,
  loadRoomFromFirestore, 
  deleteFileFromFirestore,
  saveMessageToFirestore,
  replaceWorkspaceInFirestore,
  closeRoomInFirestore,
} from '../services/firestoreService';

import { 
  Play, 
  FilePlus, 
  FolderPlus, 
  Save, 
  Terminal, 
  Video, 
  Bot, 
  Sun, 
  Share2, 
  HelpCircle,
  Download,
  Settings as SettingsIcon,
  Search,
  Replace,
  Hash,
  PanelLeft,
  X,
  Undo2,
  Redo2,
  Scissors,
  Copy,
  ClipboardPaste,
  CheckSquare,
} from 'lucide-react';

export const RoomPage: FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const state = location.state as { username?: string; roomname?: string; isHost?: boolean } | undefined;
  const username = user?.displayName || user?.email?.split('@')[0] || state?.username || localStorage.getItem('collab_username') || 'Developer';
  const [roomname, setRoomname] = useState(state?.roomname || localStorage.getItem(`room_${roomId}_name`) || 'CODE DEATH Workspace');

  // Workspace Files and Tabs State
  const [files, setFiles] = useState<ProjectFile[]>(() => getDefaultProjectFiles(roomId || 'workspace'));
  const [activeFileId, setActiveFileId] = useState<string>('f_app');
  const [openTabs, setOpenTabs] = useState<EditorTab[]>([
    { fileId: 'f_app', name: 'App.jsx', path: 'src/App.jsx', language: 'javascript' },
  ]);

  // Detected project framework and package scripts
  const detectedProject = useMemo(() => detectProject(files), [files]);

  // Workspace replacement modal & pending import state
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ files: ProjectFile[]; projectName: string } | null>(null);

  // IDE Views and Panels
  const [activeView, setActiveView] = useState<ActivityBarView | null>('explorer');
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false);
  const [findReplaceMode, setFindReplaceMode] = useState<'find' | 'replace' | null>(null);
  const [isGoToLineOpen, setIsGoToLineOpen] = useState(false);
  const [targetLine, setTargetLine] = useState<number | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [fontSize, setFontSize] = useState(13);
  const [wordWrap, setWordWrap] = useState(true);

  // Editor ref for VS Code edit actions (Undo, Redo, Cut, Copy, Paste, Select All)
  const editorRef = useRef<EditorRefHandle | null>(null);

  // Authoritative room host state loaded from Firestore/API
  const [roomHostId, setRoomHostId] = useState<string | null>(null);
  const [isRoomLoading, setIsRoomLoading] = useState<boolean>(true);

  // VS Code New File / Folder Modal State
  const [newItemModal, setNewItemModal] = useState<{
    isOpen: boolean;
    type: 'file' | 'folder';
    initialLocation: string;
  }>({
    isOpen: false,
    type: 'file',
    initialLocation: '',
  });

  const availableFolders = useMemo(() => {
    return files.filter((f) => f.isFolder).map((f) => f.path);
  }, [files]);

  const existingPaths = useMemo(() => {
    return files.map((f) => f.path);
  }, [files]);

  // Collaboration State
  const [clients, setClients] = useState<Client[]>([
    {
      socketId: 'local',
      username: username || 'Developer',
      userId: user?.uid,
      userColor: '#38bdf8',
    },
  ]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<CursorPresence[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('syncing');
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [isSaving, setIsSaving] = useState(false);
  const [isVideoActive, setIsVideoActive] = useState(false);

  // Execution & Output State
  const [outputContent, setOutputContent] = useState('');
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const filesRef = useRef<ProjectFile[]>(files);
  const saveTimeoutRef = useRef<any>(null);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const activeFile = files.find((f) => f.id === activeFileId) || files.find((f) => !f.isFolder) || null;

  // Real-time Collaborative CRDT Session State (Yjs)
  const [collabSession, setCollabSession] = useState<CollabDocSession | null>(null);
  const [isCollabSynced, setIsCollabSynced] = useState(false);

  // Synchronize CollabDocSession with the active document
  useEffect(() => {
    if (!socketRef.current || !roomId || !activeFile || activeFile.isFolder) {
      setCollabSession(null);
      setIsCollabSynced(false);
      return;
    }

    const currentSocket = socketRef.current;
    const myClient = clients.find(
      (c) => c.socketId === currentSocket.id || c.username === username
    );
    const docId = getDeterministicDocId(roomId, activeFile.path || activeFile.name);

    const session = new CollabDocSession(
      roomId,
      docId,
      currentSocket,
      activeFile.content,
      {
        name: username,
        color: myClient?.color || '#38bdf8',
        activeFile: activeFile.path,
      }
    );

    session.onSynced(() => {
      setIsCollabSynced(true);
      const currentText = session.ytext.toString();
      if (currentText && currentText !== activeFile.content) {
        setFiles((prev) =>
          prev.map((f) => (f.id === activeFile.id ? { ...f, content: currentText } : f))
        );
      }
    });

    setCollabSession(session);

    return () => {
      session.destroy();
      setIsCollabSynced(false);
    };
  }, [roomId, activeFile?.id, activeFile?.path, connectionStatus]);

  // Keep awareness user metadata up-to-date
  useEffect(() => {
    if (collabSession && activeFile) {
      const myClient = clients.find(
        (c) => c.socketId === socketRef.current?.id || c.username === username
      );
      collabSession.setUser({
        name: username,
        color: myClient?.color || '#38bdf8',
        activeFile: activeFile.path,
      });
    }
  }, [collabSession, clients, username, activeFile?.path]);

  // Ensure activeFileId stays synced with valid non-folder file
  useEffect(() => {
    if (files.length > 0 && !files.some((f) => f.id === activeFileId)) {
      const firstValid = files.find((f) => !f.isFolder);
      if (firstValid) {
        setActiveFileId(firstValid.id);
        setOpenTabs((prev) => {
          if (prev.some((t) => t.fileId === firstValid.id)) return prev;
          return [
            ...prev,
            {
              fileId: firstValid.id,
              name: firstValid.name,
              path: firstValid.path,
              language: firstValid.language,
            },
          ];
        });
      }
    }
  }, [files, activeFileId]);

  // 1. Initialize Socket.IO and Firestore
  useEffect(() => {
    if (!roomId) {
      navigate('/dashboard');
      return;
    }

    // Direct room URL protection check:
    // Any direct URL entry, shared link, or unconfirmed access must pass through Dashboard Join.
    const joinedSessionKey = `cd_joined_${roomId}`;
    const hasJoinedSession = sessionStorage.getItem(joinedSessionKey) === 'true';

    if (!hasJoinedSession) {
      navigate(`/dashboard?room=${encodeURIComponent(roomId)}`, { replace: true });
      return;
    }

    localStorage.setItem('collab_username', username);
    const socket = initSocket();
    socketRef.current = socket;

    socket.on('connect', async () => {
      setConnectionStatus('connected');
      let idToken = '';
      if (user) {
        try {
          idToken = await user.getIdToken();
        } catch {}
      }
      socket.emit(ACTIONS.JOIN, {
        roomId,
        username,
        userId: user?.uid,
        idToken,
      });
    });

    let connectAttempts = 0;
    socket.on('connect_error', () => {
      connectAttempts++;
      if (
        connectAttempts >= 2 || 
        (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') && !import.meta.env.VITE_BACKEND_URL && !import.meta.env.VITE_SOCKET_URL)
      ) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('reconnecting');
      }
    });

    socket.on('disconnect', () => {
      if (
        typeof window !== 'undefined' && 
        window.location.hostname.endsWith('vercel.app') && 
        !import.meta.env.VITE_BACKEND_URL && 
        !import.meta.env.VITE_SOCKET_URL
      ) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('offline');
      }
    });

    // Handle room error (closed / not found / forbidden)
    socket.on('room-error', ({ message }: { message: string }) => {
      sessionStorage.removeItem(`cd_joined_${roomId}`);
      toast.error(message || 'This room is no longer available.');
      navigate('/dashboard');
    });

    // Handle room deletion by host
    socket.on('room-deleted', ({ reason }: { reason?: string }) => {
      sessionStorage.removeItem(`cd_joined_${roomId}`);
      toast.error(reason || 'The room was deleted by the host.');
      navigate('/dashboard');
    });

    // Receive initial workspace state from server
    socket.on(ACTIONS.ROOM_STATE, (roomState: any) => {
      if (roomState.roomname) {
        setRoomname(roomState.roomname);
      }
      if (roomState.files && Array.isArray(roomState.files) && roomState.files.length > 0) {
        setFiles(roomState.files);
        const resolvedId = roomState.activeFileId || roomState.files.find((f: ProjectFile) => !f.isFolder)?.id || 'f_app';
        setActiveFileId(resolvedId);
        const initialActive = roomState.files.find((f: ProjectFile) => f.id === resolvedId) || roomState.files.find((f: ProjectFile) => !f.isFolder);
        if (initialActive) {
          setOpenTabs([
            {
              fileId: initialActive.id,
              name: initialActive.name,
              path: initialActive.path,
              language: initialActive.language,
            },
          ]);
        }
      }
      setConnectionStatus('connected');
    });

    // Peers joined
    socket.on(ACTIONS.JOINED, ({ clients: updatedClients, username: joinedUser, socketId }) => {
      setClients(updatedClients);
      if (socketId !== socket.id) {
        toast.success(`${joinedUser} joined the room!`, {
          icon: '👋',
          style: { background: '#1e293b', color: '#f8fafc', border: '1px solid #334155' },
        });
      }
    });

    // Peers disconnected
    socket.on(ACTIONS.DISCONNECTED, ({ username: leftUser, socketId }) => {
      toast(`${leftUser || 'A peer'} left the room`, {
        icon: '🚪',
        style: { background: '#1e293b', color: '#f8fafc', border: '1px solid #334155' },
      });
      setClients((prev) => prev.filter((c) => c.socketId !== socketId));
      setRemoteCursors((prev) => prev.filter((c) => c.userId !== socketId));
    });

    // Real-Time Delta Collaboration
    // Applies fine-grained edits without document wiping
    socket.on(ACTIONS.FILE_DELTA, ({ fileId, from, to, insert, authorId }) => {
      if (authorId === socket.id) return;
      setFiles((prevFiles) =>
        prevFiles.map((file) => {
          if (file.id === fileId) {
            const current = file.content;
            const safeFrom = Math.max(0, Math.min(from, current.length));
            const safeTo = Math.max(safeFrom, Math.min(to, current.length));
            const updatedContent = current.slice(0, safeFrom) + insert + current.slice(safeTo);
            return { ...file, content: updatedContent };
          }
          return file;
        })
      );
    });

    // Full File Content Sync
    socket.on(ACTIONS.FILE_CONTENT, ({ fileId, content, authorId }) => {
      if (authorId === socket.id) return;
      setFiles((prevFiles) =>
        prevFiles.map((f) => (f.id === fileId ? { ...f, content } : f))
      );
    });

    // Remote File Operations
    socket.on(ACTIONS.FILE_CREATE, ({ file }) => {
      setFiles((prev) => {
        if (prev.some((f) => f.id === file.id)) return prev;
        return [...prev, file];
      });
    });

    socket.on(ACTIONS.FILE_DELETE, ({ fileId, path }) => {
      setFiles((prev) => prev.filter((f) => f.id !== fileId && !f.path.startsWith(path + '/')));
      setOpenTabs((prev) => prev.filter((t) => t.fileId !== fileId));
    });

    socket.on(ACTIONS.FILE_RENAME, ({ fileId, newName, newPath }) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, name: newName, path: newPath } : f))
      );
      setOpenTabs((prev) =>
        prev.map((t) => (t.fileId === fileId ? { ...t, name: newName, path: newPath } : t))
      );
    });

    socket.on(ACTIONS.FILE_UPDATE, ({ file }: { file: ProjectFile }) => {
      setFiles((prev) => {
        const exists = prev.some((f) => f.id === file.id);
        if (exists) {
          return prev.map((f) => (f.id === file.id ? { ...f, ...file } : f));
        }
        return [...prev, file];
      });
    });

    socket.on(ACTIONS.WORKSPACE_SYNC, ({ files: syncedFiles }: { files: ProjectFile[] }) => {
      if (Array.isArray(syncedFiles)) {
        setFiles(syncedFiles);
      }
    });

    // Collaborative Workspace Replace: Peer imported new project
    socket.on(ACTIONS.WORKSPACE_REPLACE, ({ files: newFiles, activeFileId: newActiveId, projectName }) => {
      if (Array.isArray(newFiles)) {
        setFiles(newFiles);
        if (projectName) setRoomname(projectName);
        if (newActiveId) {
          const activeFile = newFiles.find((f: ProjectFile) => f.id === newActiveId);
          if (activeFile) {
            setActiveFileId(activeFile.id);
            setOpenTabs([
              { fileId: activeFile.id, name: activeFile.name, path: activeFile.path, language: activeFile.language }
            ]);
          } else {
            setActiveFileId('');
            setOpenTabs([]);
          }
        } else {
          const first = newFiles.find((f: ProjectFile) => !f.isFolder);
          if (first) {
            setActiveFileId(first.id);
            setOpenTabs([
              { fileId: first.id, name: first.name, path: first.path, language: first.language }
            ]);
          } else {
            setActiveFileId('');
            setOpenTabs([]);
          }
        }
        setOutputContent(`[CODE DEATH]: Workspace replaced with imported project "${projectName || 'project'}".\n`);
        setDiagnostics([]);
        toast(`Workspace updated with imported project "${projectName || 'project'}"`, {
          icon: '📦',
          style: { background: '#1e293b', color: '#f8fafc', border: '1px solid #334155' },
        });
      }
    });

    // Remote Cursor Positions
    socket.on(ACTIONS.CURSOR_POSITION, (cursor: CursorPresence) => {
      if (cursor.userId === socket.id) return;
      setRemoteCursors((prev) => {
        const filtered = prev.filter((c) => c.userId !== cursor.userId);
        return [...filtered, cursor];
      });
    });

    // Chat messages
    socket.on(ACTIONS.CHAT_MESSAGE, (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    // Code output shared
    socket.on(ACTIONS.CODE_OUTPUT, ({ output }) => {
      setOutputContent(output);
      setIsTerminalOpen(true);
    });

    // Room management & permissions events
    socket.on(ACTIONS.KICKED_FROM_ROOM, ({ reason }: { reason?: string }) => {
      toast.error(reason || 'You have been removed from this room by the host.');
      navigate('/');
    });

    socket.on(ACTIONS.ROOM_DELETED, ({ reason }: { reason?: string }) => {
      toast.error(reason || 'The room has been deleted by the host.');
      navigate('/');
    });

    socket.on(ACTIONS.HOST_TRANSFERRED, ({ newHostUsername }: { newHostUsername?: string }) => {
      toast.success(`${newHostUsername || 'A participant'} is now the room host.`, { icon: '👑' });
    });

    socket.on(ACTIONS.ROOM_PERMISSIONS_UPDATED, ({ isReadOnly: ro }: { isReadOnly: boolean }) => {
      setIsReadOnly(Boolean(ro));
      toast(ro ? 'Room permissions set to Read-Only mode' : 'Room permissions set to Read & Write mode', { icon: '🛡️' });
    });

    // Initial Firestore restore check & host binding
    let unsubSnapshot: (() => void) | null = null;
    let unsubParticipants: (() => void) | null = null;
    let unsubFiles: (() => void) | null = null;

    if (roomId) {
      loadRoomFromFirestore(roomId).then((data) => {
        if (data?.room) {
          const hId = data.room.hostId || data.room.ownerId || null;
          setRoomHostId(hId);
          if (data.room.name) setRoomname(data.room.name);
        }
        if (data && data.files && data.files.length > 0) {
          setFiles(data.files);
        }
        setIsRoomLoading(false);
      }).catch(() => {
        setIsRoomLoading(false);
      });

      try {
        unsubSnapshot = onSnapshot(doc(db, 'rooms', roomId), (snap) => {
          if (snap.exists()) {
            const rData = snap.data();
            const hId = rData.hostId || rData.ownerId || null;
            setRoomHostId(hId);
            if (rData.name) setRoomname(rData.name);
          }
          setIsRoomLoading(false);
        }, (err) => {
          console.warn('Firestore room snapshot error:', err);
          setIsRoomLoading(false);
        });
      } catch (err) {
        console.warn('Could not attach Firestore onSnapshot:', err);
      }

      // Register presence in Firestore
      const participantId = user?.uid || (username ? `guest_${username.replace(/[^a-zA-Z0-9]/g, '')}` : 'guest');
      const participantRef = doc(db, 'rooms', roomId, 'participants', participantId);
      setDoc(participantRef, {
        userId: participantId,
        username: username || 'Developer',
        userColor: '#38bdf8',
        lastSeen: Date.now(),
      }, { merge: true }).catch(() => {});

      // Subscribe to active participants in Firestore
      try {
        unsubParticipants = onSnapshot(collection(db, 'rooms', roomId, 'participants'), (snap) => {
          const remoteClients: Client[] = [];
          snap.forEach((d) => {
            const data = d.data();
            remoteClients.push({
              socketId: data.userId || d.id,
              username: data.username || 'Collaborator',
              userId: data.userId || d.id,
              userColor: data.userColor || '#38bdf8',
            });
          });
          if (remoteClients.length > 0) {
            setClients(remoteClients);
          }
        }, (err) => {
          console.warn('Firestore participants snapshot warning:', err);
        });
      } catch (err) {
        console.warn('Could not attach participants onSnapshot:', err);
      }

      // Real-time files update from Firestore
      try {
        unsubFiles = onSnapshot(collection(db, 'rooms', roomId, 'files'), (snap) => {
          snap.docChanges().forEach((change) => {
            if (change.type === 'added' || change.type === 'modified') {
              const fileData = change.doc.data() as ProjectFile;
              if (fileData && fileData.id) {
                setFiles((prev) => {
                  const existingIdx = prev.findIndex((f) => f.id === fileData.id);
                  if (existingIdx >= 0) {
                    const current = prev[existingIdx];
                    if (current.isDirty) return prev;
                    if (current.content === fileData.content && current.name === fileData.name) return prev;
                    const updated = [...prev];
                    updated[existingIdx] = { ...current, ...fileData, isDirty: false };
                    return updated;
                  }
                  return [...prev, fileData];
                });
              }
            } else if (change.type === 'removed') {
              const removedId = change.doc.id;
              setFiles((prev) => prev.filter((f) => f.id !== removedId));
              setOpenTabs((prev) => prev.filter((t) => t.fileId !== removedId));
            }
          });
        }, (err) => {
          console.warn('Firestore files snapshot warning:', err);
        });
      } catch (err) {
        console.warn('Could not attach files onSnapshot:', err);
      }
    }

    return () => {
      if (unsubSnapshot) unsubSnapshot();
      if (unsubParticipants) unsubParticipants();
      if (unsubFiles) unsubFiles();
      if (roomId && (user?.uid || username)) {
        const participantId = user?.uid || (username ? `guest_${username.replace(/[^a-zA-Z0-9]/g, '')}` : 'guest');
        deleteDoc(doc(db, 'rooms', roomId, 'participants', participantId)).catch(() => {});
      }
      socket.disconnect();
      socket.off(ACTIONS.ROOM_STATE);
      socket.off(ACTIONS.JOINED);
      socket.off(ACTIONS.DISCONNECTED);
      socket.off(ACTIONS.FILE_DELTA);
      socket.off(ACTIONS.FILE_CONTENT);
      socket.off(ACTIONS.FILE_CREATE);
      socket.off(ACTIONS.FILE_DELETE);
      socket.off(ACTIONS.FILE_RENAME);
      socket.off(ACTIONS.FILE_UPDATE);
      socket.off(ACTIONS.WORKSPACE_SYNC);
      socket.off(ACTIONS.CURSOR_POSITION);
      socket.off(ACTIONS.CHAT_MESSAGE);
      socket.off(ACTIONS.CODE_OUTPUT);
      socket.off(ACTIONS.KICKED_FROM_ROOM);
      socket.off(ACTIONS.ROOM_DELETED);
      socket.off(ACTIONS.HOST_TRANSFERRED);
      socket.off(ACTIONS.ROOM_PERMISSIONS_UPDATED);
    };
  }, [roomId, username, navigate]);

  // Debounced Cloud Save to Firestore
  const triggerDebouncedCloudSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (!roomId) return;
      setIsSaving(true);
      try {
        await updateRoomMetadataInFirestore(roomId, { name: roomname, activeFileId });
        await saveFilesToFirestore(roomId, filesRef.current);
      } catch (err) {
        console.warn('Auto-save error:', err);
      } finally {
        setIsSaving(false);
      }
    }, 2500);
  }, [roomId, roomname, username, activeFileId]);

  // Handle Local Code Edit with Delta Broadcasting
  const handleCodeChange = (newValue: string, viewUpdate?: any) => {
    let delta = null;

    if (viewUpdate && viewUpdate.changes) {
      viewUpdate.changes.iterChanges((fromA: number, toA: number, _fromB: number, _toB: number, inserted: any) => {
        delta = {
          from: fromA,
          to: toA,
          insert: inserted.toString(),
        };
      });
    }

    setFiles((prev) =>
      prev.map((f) => {
        if (f.id === activeFileId) {
          return { ...f, content: newValue, isDirty: true };
        }
        return f;
      })
    );

    setOpenTabs((prev) =>
      prev.map((t) => (t.fileId === activeFileId ? { ...t, isDirty: true } : t))
    );

    // Broadcast change to peers
    if (socketRef.current) {
      if (delta) {
        socketRef.current.emit(ACTIONS.FILE_DELTA, {
          roomId,
          fileId: activeFileId,
          from: delta.from,
          to: delta.to,
          insert: delta.insert,
          authorId: socketRef.current.id,
          authorName: username,
        });
      } else {
        socketRef.current.emit(ACTIONS.FILE_CONTENT, {
          roomId,
          fileId: activeFileId,
          content: newValue,
        });
      }
    }

    triggerDebouncedCloudSave();
  };

  // Cursor movement broadcast
  const handleCursorChange = (line: number, col: number) => {
    setCursorPos({ line, col });
    if (socketRef.current && activeFileId) {
      socketRef.current.emit(ACTIONS.CURSOR_POSITION, {
        roomId,
        fileId: activeFileId,
        line,
        col,
      });
    }
  };

  // Switch Active File
  const handleSelectFile = (file: ProjectFile) => {
    if (file.isFolder) return;
    setFiles((prev) => {
      if (!prev.some((f) => f.id === file.id)) {
        return [...prev, file];
      }
      return prev;
    });
    setActiveFileId(file.id);

    // Ensure tab exists
    setOpenTabs((prev) => {
      if (!prev.some((t) => t.fileId === file.id)) {
        return [
          ...prev,
          {
            fileId: file.id,
            name: file.name,
            path: file.path,
            language: file.language,
          },
        ];
      }
      return prev;
    });

    if (socketRef.current) {
      socketRef.current.emit(ACTIONS.ACTIVE_FILE_CHANGE, {
        roomId,
        fileId: file.id,
      });
    }
  };

  // Tab Close
  const handleCloseTab = (fileId: string, e: ReactMouseEvent) => {
    e.stopPropagation();
    const remaining = openTabs.filter((t) => t.fileId !== fileId);
    setOpenTabs(remaining);
    if (activeFileId === fileId && remaining.length > 0) {
      setActiveFileId(remaining[remaining.length - 1].fileId);
    }
  };

  // AI Error Fix Modal State & Actions
  const [aiFixModalState, setAiFixModalState] = useState<{
    isOpen: boolean;
    errorText: string;
    context?: string;
  }>({
    isOpen: false,
    errorText: '',
    context: '',
  });

  const handleTriggerAIFix = (errorText: string, context?: string) => {
    setAiFixModalState({
      isOpen: true,
      errorText,
      context: context || 'Terminal Execution Error',
    });
  };

  const handleApplyAIFix = (targetFilePath: string, fixedCode: string, line?: number) => {
    const normTarget = targetFilePath.replace(/^\/+/, '');
    const targetFile =
      files.find((f) => f.path === normTarget || f.name === normTarget || f.path.endsWith(normTarget)) ||
      activeFile;

    if (targetFile) {
      handleSelectFile(targetFile);
      handleCodeChange(fixedCode);
    } else if (activeFile) {
      handleCodeChange(fixedCode);
    }

    if (line) {
      setCursorPos({ line, col: 1 });
    }
  };

  // Create File / Folder
  const handleCreateFile = (name: string, isFolder: boolean, parentPath: string) => {
    const fullPath = parentPath ? `${parentPath}/${name}` : name;
    const newFile: ProjectFile = {
      id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      roomId: roomId || 'default',
      name,
      path: fullPath,
      content: isFolder ? '' : `// ${name}\n`,
      language: getFileLanguage(name),
      isFolder,
      parentPath,
      updatedAt: new Date().toISOString(),
    };

    setFiles((prev) => [...prev, newFile]);

    if (!isFolder) {
      setActiveFileId(newFile.id);
      setOpenTabs((prev) => [
        ...prev,
        {
          fileId: newFile.id,
          name: newFile.name,
          path: newFile.path,
          language: newFile.language,
        },
      ]);
    }

    if (socketRef.current) {
      socketRef.current.emit(ACTIONS.FILE_CREATE, { roomId, file: newFile });
    }

    saveFilesToFirestore(roomId || 'default', [newFile]);
    toast.success(`Created ${isFolder ? 'folder' : 'file'} ${name}`);
  };

  // Delete File / Folder
  const handleDeleteFile = (fileId: string, path: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId && !f.path.startsWith(path + '/')));
    setOpenTabs((prev) => prev.filter((t) => t.fileId !== fileId));

    if (socketRef.current) {
      socketRef.current.emit(ACTIONS.FILE_DELETE, { roomId, fileId, path });
    }

    deleteFileFromFirestore(roomId || 'default', fileId);
  };

  // Rename File / Folder
  const handleRenameFile = (fileId: string, newName: string, newPath: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, name: newName, path: newPath } : f))
    );
    setOpenTabs((prev) =>
      prev.map((t) => (t.fileId === fileId ? { ...t, name: newName, path: newPath } : t))
    );

    if (socketRef.current) {
      socketRef.current.emit(ACTIONS.FILE_RENAME, { roomId, fileId, newName, newPath });
    }
  };

  // Manual File Save (Ctrl+S)
  const handleSaveFile = async () => {
    setIsSaving(true);
    setFiles((prev) => prev.map((f) => (f.id === activeFileId ? { ...f, isDirty: false } : f)));
    setOpenTabs((prev) => prev.map((t) => (t.fileId === activeFileId ? { ...t, isDirty: false } : t)));

    try {
      if (roomId) {
        await updateRoomMetadataInFirestore(roomId, { name: roomname, activeFileId });
        await saveFilesToFirestore(roomId, filesRef.current);
      }
      toast.success('Workspace saved to Cloud Firestore!', { icon: '☁️' });
    } catch (err: any) {
      toast.error('Failed to save file');
    } finally {
      setIsSaving(false);
    }
  };

  // Execute Active Code (Run)
  const handleRunCode = async () => {
    if (!activeFile) {
      toast.error('Select a file to run');
      return;
    }

    // Save active file changes before execution
    if (socketRef.current) {
      socketRef.current.emit(ACTIONS.FILE_CONTENT, {
        roomId,
        fileId: activeFile.id,
        content: activeFile.content,
      });
      saveFileToFirestore(roomId || 'default', activeFile);
    }

    setIsTerminalOpen(true);
    setIsExecuting(true);
    setOutputContent(`[CODE DEATH Sandbox]: Compiling & running ${activeFile.path}...\n`);

    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: activeFile.language,
          code: activeFile.content,
          roomId,
          filePath: activeFile.path,
        }),
      });

      const data = await res.json();
      let formattedOutput = '';
      if (data.stdout) formattedOutput += data.stdout + '\n';
      if (data.stderr) formattedOutput += '[Error]:\n' + data.stderr + '\n';
      if (data.detectedPort) {
        formattedOutput += `\n[Development Server Listening on port ${data.detectedPort} (Preview ready at /api/preview/${data.detectedPort}/)]`;
        toast.success(`Development server active on port ${data.detectedPort}!`, { icon: '🚀' });
      } else {
        formattedOutput += `\n[Process completed in ${data.executionTime || 0}ms with exit code ${data.exitCode}]`;
      }

      setOutputContent(formattedOutput);

      // Populate diagnostics if error
      if (data.stderr) {
        setDiagnostics([
          {
            id: 'err_1',
            fileId: activeFile.id,
            fileName: activeFile.name,
            line: 1,
            col: 1,
            message: data.stderr.split('\n')[0] || 'Runtime Error',
            severity: 'error',
          },
        ]);
      } else {
        setDiagnostics([]);
      }
    } catch (err: any) {
      setOutputContent(`Failed to execute code: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // Terminate active background process in terminal
  const handleKillProcess = async () => {
    try {
      const res = await fetch('/api/terminal/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });
      const data = await res.json();
      toast.success(data.message || 'Process terminated');
    } catch (err: any) {
      toast.error('Failed to terminate process');
    } finally {
      setIsExecuting(false);
    }
  };

  // Load / Restore Demo Project
  const handleLoadDemoProject = async () => {
    try {
      const res = await fetch('/api/room/load-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });
      const data = await res.json();
      if (data.files && Array.isArray(data.files)) {
        const demoFiles: ProjectFile[] = data.files;
        setFiles(demoFiles);
        const appFile = demoFiles.find((f) => f.id === 'f_app') || demoFiles.find((f) => !f.isFolder) || demoFiles[0];
        if (appFile) {
          setActiveFileId(appFile.id);
          setOpenTabs([{ fileId: appFile.id, name: appFile.name, path: appFile.path, language: appFile.language }]);
        }
        setRoomname('CODE DEATH Demo Project');
        localStorage.setItem(`room_${roomId}_name`, 'CODE DEATH Demo Project');

        socketRef.current?.emit(ACTIONS.WORKSPACE_REPLACE, {
          roomId,
          files: demoFiles,
          activeFileId: appFile?.id || '',
          projectName: 'CODE DEATH Demo Project',
        });

        await replaceWorkspaceInFirestore(roomId || 'default', demoFiles, appFile?.id || '');

        setOutputContent('[CODE DEATH]: Loaded sample Demo Project workspace.\n');
        setDiagnostics([]);
        toast.success('Loaded sample Demo Project');
      }
    } catch (err: any) {
      toast.error('Failed to load demo project');
    }
  };

  // Replace current workspace atomically with an imported project
  const executeWorkspaceReplace = async (newFiles: ProjectFile[], projectName: string) => {
    try {
      const nonFolders = newFiles.filter((f) => !f.isFolder);
      // Auto-select entry point file
      const entryFile =
        nonFolders.find((f) => f.name === 'App.jsx' || f.name === 'main.jsx' || f.name === 'App.tsx' || f.name === 'main.tsx') ||
        nonFolders.find((f) => f.name === 'index.html') ||
        nonFolders.find((f) => f.name === 'main.py' || f.name === 'app.py') ||
        nonFolders.find((f) => f.name === 'package.json') ||
        nonFolders[0];

      // 1. Reset state completely — ONLY imported project files will remain
      setFiles(newFiles);
      setRoomname(projectName);
      localStorage.setItem(`room_${roomId}_name`, projectName);

      if (entryFile) {
        setActiveFileId(entryFile.id);
        setOpenTabs([
          {
            fileId: entryFile.id,
            name: entryFile.name,
            path: entryFile.path,
            language: entryFile.language,
          },
        ]);
      } else {
        setActiveFileId('');
        setOpenTabs([]);
      }

      // 2. Clear terminal output and reset diagnostics
      setOutputContent(`[CODE DEATH]: Workspace replaced with project "${projectName}".\nLoaded ${nonFolders.length} file(s). Ready for execution.\n`);
      setDiagnostics([]);

      // 3. Emit WORKSPACE_REPLACE to all collaborative peers
      socketRef.current?.emit(ACTIONS.WORKSPACE_REPLACE, {
        roomId,
        files: newFiles,
        activeFileId: entryFile?.id || '',
        projectName,
      });

      // 4. Update Server Disk Sandbox
      await fetch('/api/room/replace-workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          files: newFiles,
          activeFileId: entryFile?.id || '',
          roomname: projectName,
        }),
      });

      // 5. Atomic Cloud Persistence
      await replaceWorkspaceInFirestore(roomId || 'default', newFiles, projectName, entryFile?.id || '');

      toast.success(`Active workspace replaced with "${projectName}"!`, {
        icon: '🚀',
        duration: 4000,
      });
    } catch (err: any) {
      console.error('Failed to replace workspace:', err);
      toast.error(`Workspace replace error: ${err.message}`);
    }
  };

  // Merge into current workspace (optional non-destructive import)
  const executeWorkspaceMerge = async (incomingFiles: ProjectFile[]) => {
    setFiles((prev) => {
      const map = new Map(prev.map((f) => [f.path, f]));
      incomingFiles.forEach((nf) => map.set(nf.path, nf));
      return Array.from(map.values());
    });

    incomingFiles.forEach((nf) => {
      socketRef.current?.emit(ACTIONS.FILE_CREATE, { roomId, file: nf });
      saveFileToFirestore(roomId || 'default', nf);
    });

    toast.success(`Merged ${incomingFiles.length} file(s) into current workspace.`);
  };

  // Download Entire Workspace as a real .ZIP archive
  const handleDownloadProject = async () => {
    try {
      const zip = new JSZip();
      const folderName = roomname.trim() ? roomname.toLowerCase().replace(/[^a-z0-9_-]/g, '_') : 'code_death_workspace';
      const rootFolder = zip.folder(folderName) || zip;

      // Add each non-folder file to the ZIP preserving original path and content
      // Exclude node_modules/ from export ZIP to keep it lightweight and fast
      files.forEach((f) => {
        if (!f.isFolder && !f.path.startsWith('node_modules/') && f.path !== 'node_modules') {
          rootFolder.file(f.path, f.content);
        }
      });

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${folderName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Workspace exported as real .zip project!');
    } catch (err: any) {
      console.error('Failed to generate ZIP:', err);
      toast.error('Failed to export workspace ZIP');
    }
  };

  // Sync workspace explorer with real filesystem disk
  const handleRefreshFiles = async () => {
    try {
      const res = await fetch('/api/workspace/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });
      const data = await res.json();
      if (data.files && Array.isArray(data.files)) {
        setFiles(data.files);
        toast.success(`Workspace synced with disk (${data.files.length} items)`, { icon: '🔄' });
      }
    } catch (err: any) {
      toast.error('Failed to sync explorer with disk');
    }
  };

  // Download individual file preserving EXACT name, extension, and content
  const handleDownloadFile = (file: ProjectFile) => {
    if (file.isFolder) {
      toast.error('Cannot download a folder directly. Use Export Workspace (.zip).');
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    let mimeType = 'text/plain;charset=utf-8';
    if (ext === 'html') mimeType = 'text/html;charset=utf-8';
    else if (ext === 'css') mimeType = 'text/css;charset=utf-8';
    else if (ext === 'js' || ext === 'jsx') mimeType = 'application/javascript;charset=utf-8';
    else if (ext === 'ts' || ext === 'tsx') mimeType = 'application/typescript;charset=utf-8';
    else if (ext === 'json') mimeType = 'application/json;charset=utf-8';
    else if (ext === 'py') mimeType = 'text/x-python;charset=utf-8';
    else if (ext === 'md') mimeType = 'text/markdown;charset=utf-8';

    const blob = new Blob([file.content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    // Exactly preserves filename and extension — never appends .txt
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${file.name}`);
  };

  // Upload file(s), folder, or ZIP archive into workspace
  const handleUploadFiles = async (fileList: FileList | File[]) => {
    const filesArray = Array.from(fileList);
    if (filesArray.length === 0) return;

    const extractedFiles: ProjectFile[] = [];
    let detectedName = '';
    const binaryExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'pdf', 'exe', 'bin', 'wasm', 'woff', 'woff2', 'mp3', 'mp4', 'zip', 'tar', 'gz'];
    const ignoredDirs = ['node_modules', '.git', '.next', 'dist', 'build', '.cache', '__pycache__', '.vscode', '.idea'];
    const ignoredFiles = ['.DS_Store', 'Thumbs.db', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

    const shouldIgnorePath = (p: string) => {
      const segments = p.split(/[/\\]/);
      return segments.some((seg) => ignoredDirs.includes(seg)) || ignoredFiles.includes(segments[segments.length - 1]);
    };

    for (const file of filesArray) {
      // Check if it's a zip archive
      if (file.name.endsWith('.zip')) {
        try {
          detectedName = file.name.replace(/\.zip$/i, '');
          const zip = new JSZip();
          const zipData = await zip.loadAsync(file);

          for (const [relativePath, zipEntry] of Object.entries(zipData.files)) {
            // Strip leading slash if any
            const normalizedPath = relativePath.replace(/^\/+/, '');
            if (!normalizedPath) continue;
            if (shouldIgnorePath(normalizedPath)) continue;

            if (zipEntry.dir) {
              const cleanPath = normalizedPath.replace(/\/$/, '');
              const parts = cleanPath.split('/');
              const name = parts[parts.length - 1];
              const parentPath = parts.slice(0, -1).join('/');
              extractedFiles.push({
                id: `f_zip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                name,
                path: cleanPath,
                content: '',
                language: 'plaintext',
                isFolder: true,
                parentPath,
              });
            } else {
              const parts = normalizedPath.split('/');
              const name = parts[parts.length - 1];
              const ext = name.split('.').pop()?.toLowerCase();
              if (ext && binaryExtensions.includes(ext)) {
                continue;
              }
              const content = await zipEntry.async('text');
              // Guard against massive single files (> 5MB)
              if (content.length > 5 * 1024 * 1024) {
                continue;
              }
              const parentPath = parts.slice(0, -1).join('/');
              const language = getFileLanguage(name);
              extractedFiles.push({
                id: `f_zip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                name,
                path: normalizedPath,
                content,
                language,
                isFolder: false,
                parentPath,
              });
            }
          }
        } catch (zipErr: any) {
          console.error('Error importing ZIP:', zipErr);
          toast.error(`Could not read ZIP archive: ${zipErr.message}`);
          return;
        }
        continue;
      }

      // Check binary extension
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext && binaryExtensions.includes(ext)) {
        continue;
      }

      try {
        const fullPath = (file as any).webkitRelativePath || file.name;
        if (shouldIgnorePath(fullPath)) continue;

        if (file.size > 5 * 1024 * 1024) {
          toast.error(`File ${file.name} is too large (>5MB) to import into workspace.`);
          continue;
        }

        const textContent = await file.text();
        const parts = fullPath.split('/');
        const name = parts[parts.length - 1];
        const parentPath = parts.slice(0, -1).join('/');

        if (!detectedName && parts.length > 1) {
          detectedName = parts[0];
        }

        extractedFiles.push({
          id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name,
          path: fullPath,
          content: textContent,
          language: getFileLanguage(name),
          isFolder: false,
          parentPath,
        });
      } catch (fErr: any) {
        toast.error(`Error reading ${file.name}`);
      }
    }

    if (extractedFiles.length === 0) {
      toast.error('No readable code or text files found in the import.');
      return;
    }

    const finalProjectName = detectedName || (extractedFiles.find((f) => f.name === 'package.json') ? 'Imported App' : 'Imported Project');

    // Rule: IMPORT = REPLACE CURRENT ACTIVE WORKSPACE.
    // If workspace currently has files, show confirmation modal to verify replacement
    if (files.length > 0) {
      setPendingImport({
        files: extractedFiles,
        projectName: finalProjectName,
      });
      setShowReplaceModal(true);
    } else {
      executeWorkspaceReplace(extractedFiles, finalProjectName);
    }
  };

  // Upload file from computer (compat handler)
  const handleUploadFile = (e: ReactChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleUploadFiles(e.target.files);
    }
  };

  // Chat message send
  const handleSendMessage = (text: string) => {
    if (socketRef.current) {
      socketRef.current.emit(ACTIONS.CHAT_MESSAGE, {
        roomId,
        message: text,
      });

      const newMsg: ChatMessage = {
        id: `msg_${Date.now()}`,
        sender: username,
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      saveMessageToFirestore(roomId || 'default', newMsg);
    }
  };

  // Share output to peers
  const handleShareOutput = (output: string) => {
    if (socketRef.current) {
      socketRef.current.emit(ACTIONS.CODE_OUTPUT, { roomId, output });
      toast.success('Broadcasted execution output to peers!');
    }
  };

  const myClient = clients.find((c) => c.username === username || (user?.uid && (c as any).userId === user.uid));
  // Authoritative host check based on Firebase Auth UID and roomHostId from database
  // Strictly prevent false host attribution: UID must match persistent room owner
  const isHost = !isRoomLoading && Boolean(
    (user?.uid && roomHostId && user.uid === roomHostId) ||
    (state?.isHost && (!roomHostId || (user?.uid && user.uid === roomHostId)))
  );

  // Save all files
  const handleSaveAll = useCallback(async () => {
    setIsSaving(true);
    setFiles((prev) => prev.map((f) => ({ ...f, isDirty: false })));
    setOpenTabs((prev) => prev.map((t) => ({ ...t, isDirty: false })));
    if (roomId) {
      await saveFilesToFirestore(roomId, filesRef.current);
    }
    setIsSaving(false);
    toast.success('All files saved to workspace');
  }, [roomId]);

  // Host operations
  const handleKickUser = useCallback((targetSocketId: string, targetUsername: string) => {
    if (socketRef.current && roomId) {
      socketRef.current.emit(ACTIONS.KICK_USER, { roomId, targetSocketId });
      toast.success(`Removed ${targetUsername} from session.`);
    }
  }, [roomId]);

  const handleTransferHost = useCallback((targetSocketId: string, targetUsername: string) => {
    if (socketRef.current && roomId) {
      socketRef.current.emit(ACTIONS.TRANSFER_HOST, { roomId, targetSocketId });
      toast.success(`Transferred host privileges to ${targetUsername}.`);
    }
  }, [roomId]);

  const handleTogglePermissions = useCallback((newReadOnly: boolean) => {
    if (socketRef.current && roomId) {
      socketRef.current.emit(ACTIONS.UPDATE_ROOM_PERMISSIONS, { roomId, isReadOnly: newReadOnly });
      setIsReadOnly(newReadOnly);
      toast(newReadOnly ? 'Switched to Read-Only mode' : 'Switched to Read & Write mode', { icon: '🛡️' });
    }
  }, [roomId]);

  const handleLeaveRoom = useCallback(() => {
    if (roomId) {
      sessionStorage.removeItem(`cd_joined_${roomId}`);
    }
    if (socketRef.current && roomId) {
      socketRef.current.emit(ACTIONS.LEAVE_ROOM, { roomId });
    }
    navigate('/dashboard');
  }, [roomId, navigate]);

  const handleDeleteRoom = useCallback(async () => {
    if (!roomId) return;
    try {
      sessionStorage.removeItem(`cd_joined_${roomId}`);
      if (user?.uid) {
        await closeRoomInFirestore(roomId, user.uid);
      }
      if (socketRef.current) {
        socketRef.current.emit(ACTIONS.DELETE_ROOM, { roomId });
      }
      await fetch(`/api/room/${roomId}`, { method: 'DELETE' });
      toast.success('Workspace deleted.');
      navigate('/dashboard');
    } catch {
      toast.error('Failed to delete workspace.');
    }
  }, [roomId, user?.uid, navigate]);

  const handleGoToLine = useCallback((line: number) => {
    setCursorPos({ line, col: 1 });
    setTargetLine(line);
    toast.success(`Jumped to line ${line}`);
  }, []);

  // Command palette command registry
  const commands: CommandItem[] = [
    {
      id: 'run-code',
      category: 'Run',
      title: 'Execute Active File',
      shortcut: 'F5 / Ctrl+Enter',
      icon: <Play className="w-4 h-4 text-emerald-400" />,
      action: handleRunCode,
    },
    {
      id: 'save-file',
      category: 'File',
      title: 'Save Current File',
      shortcut: 'Ctrl+S',
      icon: <Save className="w-4 h-4 text-cyan-400" />,
      action: handleSaveFile,
    },
    {
      id: 'save-all',
      category: 'File',
      title: 'Save All Files',
      shortcut: 'Ctrl+Shift+S',
      icon: <Save className="w-4 h-4 text-emerald-400" />,
      action: handleSaveAll,
    },
    {
      id: 'quick-open',
      category: 'File',
      title: 'Quick Open / Find File',
      shortcut: 'Ctrl+P',
      icon: <Search className="w-4 h-4 text-cyan-400" />,
      action: () => setIsQuickOpenOpen(true),
    },
    {
      id: 'find-file',
      category: 'Editor',
      title: 'Find in File',
      shortcut: 'Ctrl+F',
      icon: <Search className="w-4 h-4 text-cyan-400" />,
      action: () => setFindReplaceMode('find'),
    },
    {
      id: 'replace-file',
      category: 'Editor',
      title: 'Replace in File',
      shortcut: 'Ctrl+H',
      icon: <Replace className="w-4 h-4 text-indigo-400" />,
      action: () => setFindReplaceMode('replace'),
    },
    {
      id: 'goto-line',
      category: 'Editor',
      title: 'Go to Line',
      shortcut: 'Ctrl+G',
      icon: <Hash className="w-4 h-4 text-amber-400" />,
      action: () => setIsGoToLineOpen(true),
    },
    {
      id: 'undo-action',
      category: 'Edit',
      title: 'Undo',
      shortcut: 'Ctrl+Z',
      icon: <Undo2 className="w-4 h-4 text-slate-300" />,
      action: () => { editorRef.current?.undo(); },
    },
    {
      id: 'redo-action',
      category: 'Edit',
      title: 'Redo',
      shortcut: 'Ctrl+Shift+Z',
      icon: <Redo2 className="w-4 h-4 text-slate-300" />,
      action: () => { editorRef.current?.redo(); },
    },
    {
      id: 'cut-action',
      category: 'Edit',
      title: 'Cut Selection',
      shortcut: 'Ctrl+X',
      icon: <Scissors className="w-4 h-4 text-slate-300" />,
      action: () => { editorRef.current?.cut(); },
    },
    {
      id: 'copy-action',
      category: 'Edit',
      title: 'Copy Selection',
      shortcut: 'Ctrl+C',
      icon: <Copy className="w-4 h-4 text-slate-300" />,
      action: () => { editorRef.current?.copy(); },
    },
    {
      id: 'paste-action',
      category: 'Edit',
      title: 'Paste from Clipboard',
      shortcut: 'Ctrl+V',
      icon: <ClipboardPaste className="w-4 h-4 text-slate-300" />,
      action: () => { editorRef.current?.paste(); },
    },
    {
      id: 'select-all-action',
      category: 'Edit',
      title: 'Select All',
      shortcut: 'Ctrl+A',
      icon: <CheckSquare className="w-4 h-4 text-slate-300" />,
      action: () => { editorRef.current?.selectAll(); },
    },
    {
      id: 'new-file',
      category: 'File',
      title: 'Create New File...',
      shortcut: 'Ctrl+N',
      icon: <FilePlus className="w-4 h-4 text-sky-400" />,
      action: () => setNewItemModal({ isOpen: true, type: 'file', initialLocation: '' }),
    },
    {
      id: 'new-folder',
      category: 'File',
      title: 'Create New Folder...',
      icon: <FolderPlus className="w-4 h-4 text-amber-400" />,
      action: () => setNewItemModal({ isOpen: true, type: 'folder', initialLocation: '' }),
    },
    {
      id: 'toggle-terminal',
      category: 'View',
      title: 'Toggle Integrated Terminal',
      shortcut: 'Ctrl+`',
      icon: <Terminal className="w-4 h-4 text-emerald-400" />,
      action: () => setIsTerminalOpen((prev) => !prev),
    },
    {
      id: 'toggle-sidebar',
      category: 'View',
      title: 'Toggle Primary Sidebar',
      shortcut: 'Ctrl+B',
      icon: <PanelLeft className="w-4 h-4 text-slate-300" />,
      action: () => setActiveView((prev) => (prev ? null : 'explorer')),
    },
    {
      id: 'toggle-theme',
      category: 'Preferences',
      title: `Switch Theme to ${theme === 'dark' ? 'Light' : 'Dark'}`,
      icon: <Sun className="w-4 h-4 text-amber-400" />,
      action: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    },
    {
      id: 'download-file',
      category: 'File',
      title: 'Download Active File',
      icon: <Download className="w-4 h-4 text-cyan-400" />,
      action: () => {
        if (activeFile) {
          handleDownloadFile(activeFile);
        } else {
          toast.error('No active file selected to download');
        }
      },
    },
    {
      id: 'download-zip',
      category: 'File',
      title: 'Download Project Workspace (.zip)',
      icon: <Download className="w-4 h-4 text-indigo-400" />,
      action: handleDownloadProject,
    },
    {
      id: 'jarvis-ai',
      category: 'AI',
      title: 'Open JARVIS AI Assistant',
      icon: <Bot className="w-4 h-4 text-indigo-400" />,
      action: () => setActiveView('chat'),
    },
    {
      id: 'collaborators',
      category: 'Collaboration',
      title: 'View Collaborators & Presence',
      icon: <Share2 className="w-4 h-4 text-cyan-400" />,
      action: () => setActiveView('collab'),
    },
    {
      id: 'toggle-video',
      category: 'Collaboration',
      title: 'Open Video & Audio Call Room',
      icon: <Video className="w-4 h-4 text-sky-400" />,
      action: () => setActiveView('video'),
    },
  ];

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command palette: Ctrl+Shift+P
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
      // Save all: Ctrl+Shift+S
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        handleSaveAll();
      }
      // Quick Open: Ctrl+P
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setIsQuickOpenOpen(true);
      }
      // New File: Ctrl+N
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        setNewItemModal({ isOpen: true, type: 'file', initialLocation: '' });
      }
      // Save: Ctrl+S
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSaveFile();
      }
      // Find: Ctrl+F
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setFindReplaceMode('find');
      }
      // Replace: Ctrl+H
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        setFindReplaceMode('replace');
      }
      // Go to line: Ctrl+G
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        setIsGoToLineOpen(true);
      }
      // Toggle sidebar: Ctrl+B
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setActiveView((prev) => (prev ? null : 'explorer'));
      }
      // Toggle terminal: Ctrl+`
      else if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        setIsTerminalOpen((prev) => !prev);
      }
      // Run code: F5
      else if (e.key === 'F5') {
        e.preventDefault();
        handleRunCode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFile, files, handleSaveFile, handleSaveAll, handleRunCode]);

  return (
    <div className={`flex flex-col h-screen w-screen overflow-hidden font-sans select-none ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      <Toaster position="top-right" />

      {/* VS Code Command Palette (Ctrl+Shift+P) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        commands={commands}
      />

      {/* Quick Open File (Ctrl+P) */}
      <QuickOpenModal
        isOpen={isQuickOpenOpen}
        onClose={() => setIsQuickOpenOpen(false)}
        files={files}
        onSelectFile={handleSelectFile}
      />

      {/* Find & Replace (Ctrl+F / Ctrl+H) */}
      <FindReplaceModal
        isOpen={findReplaceMode !== null}
        mode={findReplaceMode || 'find'}
        onClose={() => setFindReplaceMode(null)}
        currentContent={activeFile?.content || ''}
        onApplyContent={handleCodeChange}
      />

      {/* Go to Line (Ctrl+G) */}
      <GoToLineModal
        isOpen={isGoToLineOpen}
        onClose={() => setIsGoToLineOpen(false)}
        maxLines={activeFile ? activeFile.content.split('\n').length : 1}
        onGoToLine={handleGoToLine}
      />

      {/* Workspace Replacement Confirmation Modal */}
      <ReplaceWorkspaceModal
        isOpen={showReplaceModal}
        currentFileCount={files.filter((f) => !f.isFolder).length}
        incomingFileCount={pendingImport?.files.filter((f) => !f.isFolder).length || 0}
        incomingProjectName={pendingImport?.projectName || 'Imported Project'}
        onConfirmReplace={() => {
          if (pendingImport) {
            executeWorkspaceReplace(pendingImport.files, pendingImport.projectName);
            setPendingImport(null);
          }
          setShowReplaceModal(false);
        }}
        onConfirmMerge={() => {
          if (pendingImport) {
            executeWorkspaceMerge(pendingImport.files);
            setPendingImport(null);
          }
          setShowReplaceModal(false);
        }}
        onCancel={() => {
          setPendingImport(null);
          setShowReplaceModal(false);
        }}
      />

      {/* AI Error Diagnosis & Verified Fix Modal */}
      <AIErrorFixModal
        isOpen={aiFixModalState.isOpen}
        onClose={() => setAiFixModalState((prev) => ({ ...prev, isOpen: false }))}
        errorText={aiFixModalState.errorText}
        commandContext={aiFixModalState.context}
        activeFile={activeFile}
        files={files}
        roomId={roomId || 'default'}
        onApplyFix={handleApplyAIFix}
      />

      {/* VS Code New File / Folder Modal */}
      <NewItemModal
        isOpen={newItemModal.isOpen}
        type={newItemModal.type}
        availableFolders={availableFolders}
        existingPaths={existingPaths}
        initialLocation={newItemModal.initialLocation}
        onClose={() => setNewItemModal((prev) => ({ ...prev, isOpen: false }))}
        onCreate={(name, isFolder, location) => {
          handleCreateFile(name, isFolder, location);
          setNewItemModal((prev) => ({ ...prev, isOpen: false }));
        }}
      />

      {/* Top Menu Bar */}
      <TopMenuBar
        roomId={roomId || ''}
        roomname={roomname}
        activeFile={activeFile}
        onRunCode={handleRunCode}
        onSaveFile={handleSaveFile}
        onSaveAll={handleSaveAll}
        onNewFile={() => {
          setNewItemModal({ isOpen: true, type: 'file', initialLocation: '' });
        }}
        onNewFolder={() => {
          setNewItemModal({ isOpen: true, type: 'folder', initialLocation: '' });
        }}
        onDownloadProject={handleDownloadProject}
        onToggleTerminal={() => setIsTerminalOpen((prev) => !prev)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenView={(v) => setActiveView(v)}
        onLeaveRoom={handleLeaveRoom}
        isSaving={isSaving}
        onUndo={() => editorRef.current?.undo()}
        onRedo={() => editorRef.current?.redo()}
        onCut={() => editorRef.current?.cut()}
        onCopy={() => editorRef.current?.copy()}
        onPaste={() => editorRef.current?.paste()}
        onFind={() => setFindReplaceMode('find')}
        onReplace={() => setFindReplaceMode('replace')}
        onSelectAll={() => editorRef.current?.selectAll()}
        onGoToLine={() => setIsGoToLineOpen(true)}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Activity Bar (Leftmost Strip) */}
        <ActivityBar
          activeView={activeView}
          onSelectView={(v) => setActiveView(activeView === v ? null : v)}
          onToggleTerminal={() => setIsTerminalOpen((prev) => !prev)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          participantCount={clients.length}
          isTerminalOpen={isTerminalOpen}
          isVideoActive={isVideoActive}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        />

        {/* Collapsible Side Panel */}
        {activeView && (
          <aside className={`${activeView === 'video' ? 'w-80' : 'w-64 sm:w-72'} flex-shrink-0 h-full border-r border-slate-800 bg-slate-900/95 flex flex-col z-10 transition-all duration-150`}>
            {activeView === 'explorer' && (
              <FileExplorer
                files={files}
                activeFileId={activeFileId}
                onSelectFile={handleSelectFile}
                onCreateFile={handleCreateFile}
                onDeleteFile={handleDeleteFile}
                onRenameFile={handleRenameFile}
                onDownloadProject={handleDownloadProject}
                onDownloadFile={handleDownloadFile}
                onUploadFile={handleUploadFile}
                onUploadFiles={handleUploadFiles}
                onLoadDemoProject={handleLoadDemoProject}
                roomname={roomname}
                roomId={roomId}
                onRefreshFiles={handleRefreshFiles}
              />
            )}

            {activeView === 'search' && (
              <WorkspaceSearch
                files={files}
                onSelectFileAtLine={(file, line) => {
                  handleSelectFile(file);
                  setCursorPos({ line, col: 1 });
                  setTargetLine(line);
                }}
              />
            )}

            {activeView === 'collab' && (
              <CollaboratorsPanel
                clients={clients}
                currentUsername={username}
                isHost={isHost}
                roomId={roomId || ''}
                files={files}
                onKickUser={handleKickUser}
                onTransferHost={handleTransferHost}
                onTogglePermissions={handleTogglePermissions}
                onDeleteRoom={handleDeleteRoom}
                onLeaveRoom={handleLeaveRoom}
                isReadOnly={isReadOnly}
              />
            )}

            {activeView === 'chat' && (
              <div className="flex flex-col h-full">
                <ChatPanel
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  currentUsername={username}
                  currentCode={activeFile?.content || ''}
                  language={activeFile?.language || 'javascript'}
                  onApplyCode={(newCode) => handleCodeChange(newCode)}
                  files={files}
                  activeFileName={activeFile?.name}
                  activeFilePath={activeFile?.path}
                  terminalOutput={outputContent}
                  diagnostics={diagnostics}
                />
              </div>
            )}

            {activeView === 'video' && (
              <VideoCallPanel
                currentUsername={username}
                clients={clients}
                socket={socketRef.current}
                roomId={roomId || ''}
                onClose={() => setActiveView(null)}
                onCallStateChange={(active) => setIsVideoActive(active)}
              />
            )}

            {activeView === 'settings' && (
              <div className="p-4 space-y-4 text-xs text-slate-300">
                <div className="font-bold text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
                  IDE SETTINGS
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-400 font-semibold block">Theme</label>
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-100"
                  >
                    <option value="dark">VS Code Dark+ (Default)</option>
                    <option value="light">VS Code Light+</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-400 font-semibold block">Font Size ({fontSize}px)</label>
                  <input
                    type="range"
                    min="11"
                    max="20"
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-400 font-semibold block">Word Wrap</label>
                  <button
                    onClick={() => setWordWrap(!wordWrap)}
                    className={`w-full py-1.5 px-3 rounded border text-left font-medium transition-colors ${
                      wordWrap ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    {wordWrap ? 'Word Wrap: Enabled' : 'Word Wrap: Disabled'}
                  </button>
                </div>

                <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-500">
                  CODE DEATH Collaborative IDE v3.0
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Center Editor + Bottom Terminal Panel */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 h-full relative overflow-hidden">
          {/* Editor Tabs Bar */}
          <EditorTabs
            tabs={openTabs}
            activeFileId={activeFileId}
            onSelectTab={(fileId) => {
              const file = files.find((f) => f.id === fileId);
              if (file) handleSelectFile(file);
            }}
            onCloseTab={handleCloseTab}
          />

          {/* Active Code Editor */}
          <div className="flex-1 min-h-0 min-w-0 relative flex flex-col overflow-hidden">
            {activeFile ? (
              <CodeEditorView
                ref={editorRef}
                code={activeFile.content || ''}
                language={activeFile.language}
                onChange={handleCodeChange}
                onCursorChange={handleCursorChange}
                onSave={handleSaveFile}
                onRun={handleRunCode}
                theme={theme}
                fontSize={fontSize}
                wordWrap={wordWrap}
                readOnly={isReadOnly && !isHost}
                remoteCursors={remoteCursors.filter((c) => c.fileId === activeFileId)}
                docId={activeFile.id}
                targetLine={targetLine}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs space-y-2">
                <span>No file is currently open</span>
                <button
                  onClick={() => {
                    const first = files.find((f) => !f.isFolder);
                    if (first) handleSelectFile(first);
                  }}
                  className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded font-medium"
                >
                  Open {files.find((f) => !f.isFolder)?.name || 'App.jsx'}
                </button>
              </div>
            )}
          </div>

          {/* Bottom Interactive Terminal & Output Panel */}
          <TerminalPanel
            isOpen={isTerminalOpen}
            onClose={() => setIsTerminalOpen(false)}
            roomId={roomId || ''}
            projectName={roomname}
            activeFileId={activeFileId}
            activeFilePath={activeFile?.path}
            outputContent={outputContent}
            diagnostics={diagnostics}
            detectedScripts={detectedProject.scripts}
            isProcessRunning={isExecuting}
            onKillProcess={handleKillProcess}
            onClearOutput={() => setOutputContent('')}
            socket={socketRef.current}
            onSelectDiagnostic={(d) => {
              const file = files.find((f) => f.id === d.fileId);
              if (file) handleSelectFile(file);
              setCursorPos({ line: d.line, col: d.col });
              setTargetLine(d.line);
            }}
            onShareOutput={handleShareOutput}
            onRunCurrentFile={handleRunCode}
            onTriggerAIFix={handleTriggerAIFix}
          />
        </main>
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        roomId={roomId || 'workspace'}
        roomname={roomname}
        language={activeFile?.language || 'javascript'}
        connectionStatus={connectionStatus}
        cursorLine={cursorPos.line}
        cursorCol={cursorPos.col}
        errorCount={diagnostics.filter((d) => d.severity === 'error').length}
        warningCount={diagnostics.filter((d) => d.severity === 'warning').length}
        participantCount={clients.length}
        onToggleTerminal={() => setIsTerminalOpen((prev) => !prev)}
      />
    </div>
  );
};
