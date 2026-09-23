import React, { useState, useEffect, FC, FormEvent } from 'react';
import { useNavigate, useLocation, useParams, useSearchParams, Link } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import toast, { Toaster } from 'react-hot-toast';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { saveRoomToFirestore } from '../services/firestoreService';
import { CodeDeathLogo } from '../components/CodeDeathLogo';
import { 
  Plus, 
  ArrowRight, 
  LogOut, 
  Sparkles, 
  Users, 
  Terminal, 
  RefreshCw, 
  ShieldCheck, 
  Code,
  FolderGit2,
  Cpu,
  Layers,
  KeyRound,
  Loader2,
  AlertCircle
} from 'lucide-react';

interface ActiveRoom {
  roomId: string;
  roomname: string;
  language: string;
  participantsCount: number;
  lastUpdated: string;
}

export const HomePage: FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ roomCode?: string }>();
  const [searchParams] = useSearchParams();
  const { user, logout } = useAuth();

  const [username, setUsername] = useState(user?.displayName || user?.email?.split('@')[0] || 'Developer');
  const [roomId, setRoomId] = useState('');
  const [roomName, setRoomName] = useState('');
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [recentRooms, setRecentRooms] = useState<ActiveRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [inviteDetected, setInviteDetected] = useState(false);

  // Check URL params or search params for shared invite codes
  useEffect(() => {
    const rawCode = params.roomCode || searchParams.get('room') || (location.state as any)?.roomCode;
    if (rawCode && typeof rawCode === 'string' && rawCode.trim()) {
      const cleanCode = rawCode.trim();
      setRoomId(cleanCode);
      setActiveTab('join');
      setInviteDetected(true);
      toast('Shared Room Code loaded. Confirm joining below.', { icon: '🔑' });
    }
  }, [params.roomCode, searchParams, location.state]);

  useEffect(() => {
    if (user?.displayName) {
      setUsername(user.displayName);
    } else if (user?.email) {
      setUsername(user.email.split('@')[0]);
    }
    fetchRecentRooms();
  }, [user]);

  const fetchRecentRooms = async () => {
    try {
      setLoadingRooms(true);
      const res = await fetch('/api/rooms');
      if (res.ok) {
        const data = await res.json();
        setRecentRooms(data);
      }
    } catch (err) {
      console.warn('Failed to fetch rooms', err);
    } finally {
      setLoadingRooms(false);
    }
  };

  const handleGenerateId = () => {
    const newId = uuidv4().slice(0, 8);
    setRoomId(newId);
    toast.success('Generated new Room ID!');
  };

  const handleCreateRoom = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Authentication required. Please sign in to create a workspace room.');
      navigate('/login');
      return;
    }

    const finalUser = username.trim() || user?.displayName || user?.email?.split('@')[0] || 'Developer';
    const finalRoomId = roomId.trim() || uuidv4().slice(0, 8);
    const finalRoomName = roomName.trim() || `${finalUser}'s Workspace`;

    setIsValidating(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/room/create', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ 
          roomId: finalRoomId, 
          roomName: finalRoomName,
          hostId: user.uid,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || 'Could not initialize room on server');
      }

      const createdRoom = data.room || { roomId: finalRoomId, roomName: finalRoomName, hostId: user.uid };

      localStorage.setItem('collab_username', finalUser);
      localStorage.setItem(`room_${createdRoom.roomId}_name`, createdRoom.roomName);
      // Authorize tab session for direct entry
      sessionStorage.setItem(`cd_joined_${createdRoom.roomId}`, 'true');

      // Sync Firestore room document with host ID
      await saveRoomToFirestore(createdRoom.roomId, createdRoom.roomName, user.uid, '');

      toast.success(`Created workspace: ${createdRoom.roomName}`);

      navigate(`/room/${createdRoom.roomId}`, {
        state: {
          username: finalUser,
          roomname: createdRoom.roomName,
          isHost: true,
        },
      });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create workspace room');
    } finally {
      setIsValidating(false);
    }
  };

  const handleJoinRoom = async (e: FormEvent) => {
    e.preventDefault();
    const cleanRoomId = roomId.trim();
    if (!cleanRoomId) {
      toast.error('Please enter a Room ID to join');
      return;
    }

    setIsValidating(true);
    try {
      const res = await fetch(`/api/room/validate/${encodeURIComponent(cleanRoomId)}`);
      const data = await res.json();

      if (!data.valid) {
        if (data.reason === 'closed') {
          toast.error('This room is no longer available.');
        } else if (data.reason === 'not_found') {
          toast.error('Room not found');
        } else if (data.reason === 'permission_denied') {
          toast.error("You don't have permission to join this room.");
        } else {
          toast.error(data.message || 'Room not found');
        }
        return;
      }

      const finalUser = username.trim() || user?.displayName || user?.email?.split('@')[0] || 'Developer';
      localStorage.setItem('collab_username', finalUser);
      // Authorize tab session for this specific room
      sessionStorage.setItem(`cd_joined_${cleanRoomId}`, 'true');

      navigate(`/room/${cleanRoomId}`, {
        state: {
          username: finalUser,
          roomname: data.roomname || 'Collaborative Workspace',
          isHost: false,
        },
      });
    } catch (err) {
      toast.error('Failed to validate room. Please check your network and try again.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col justify-between overflow-x-hidden text-slate-100 bg-[#080c14] font-sans select-none">
      <Toaster position="top-right" />

      {/* Cyber Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Ambient glowing accents */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Navigation */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 py-5 flex items-center justify-between border-b border-slate-800/60">
        <CodeDeathLogo size="md" showText={true} subtitle="WORKSPACE DASHBOARD" />

        {/* User profile & Logout */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-500 to-rose-500 flex items-center justify-center font-bold text-white text-[11px] shadow-sm">
              {(username || 'D').charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col text-left">
              <span className="font-semibold text-slate-200 leading-tight truncate max-w-[140px]">
                {username}
              </span>
              <span className="text-[10px] text-slate-400 font-mono truncate max-w-[140px]">
                {user?.email || 'Authenticated'}
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-rose-950/40 hover:border-rose-800/80 border border-slate-800 text-slate-300 hover:text-rose-300 text-xs font-semibold transition-all cursor-pointer shadow-sm"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Area - Balanced Centered Two-Column Layout */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 py-8 lg:py-12 my-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(380px,440px)] gap-10 lg:gap-14 xl:gap-20 items-center justify-between">
          
          {/* Left Side: Brand, Description & Feature Points */}
          <div className="space-y-6 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Realtime Collaboration for Developers</span>
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-tight">
                CODE DEATH
              </h1>
              <p className="text-base sm:text-lg text-slate-300 font-medium leading-snug">
                Build together. Code together.
              </p>
            </div>

            <p className="text-sm sm:text-[15px] text-slate-300/90 leading-relaxed max-w-2xl">
              <strong className="text-white font-semibold">CODE DEATH</strong> is a real-time collaborative development workspace where developers can code together, share projects, run code, use an integrated terminal, communicate through video/audio, and get AI-powered coding assistance — all inside one workspace.
            </p>

            {/* 6 Compact Feature Points */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs sm:text-[13px] text-slate-300">
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <span className="text-cyan-400 text-sm">⚡</span>
                <span className="font-medium">Real-time collaborative coding</span>
              </div>
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <span className="text-cyan-400 text-sm">💻</span>
                <span className="font-medium">VS Code-style editor & terminal</span>
              </div>
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <span className="text-cyan-400 text-sm">🤖</span>
                <span className="font-medium">Gemini-powered coding assistant</span>
              </div>
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <span className="text-cyan-400 text-sm">📁</span>
                <span className="font-medium">Shared project workspace</span>
              </div>
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <span className="text-cyan-400 text-sm">🎥</span>
                <span className="font-medium">Video, audio & screen sharing</span>
              </div>
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <span className="text-cyan-400 text-sm">🔒</span>
                <span className="font-medium">Secure Firebase-powered rooms</span>
              </div>
            </div>
          </div>

          {/* Right Side: Compact Room Action Box */}
          <div className="w-full max-w-[440px] justify-self-center lg:justify-self-end bg-slate-900/95 border border-slate-800/90 backdrop-blur-2xl rounded-2xl p-6 sm:p-7 shadow-2xl shadow-black/50 space-y-5">
          {/* Tab Selector */}
          <div className="flex bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'create'
                  ? 'bg-gradient-to-r from-cyan-600 to-cyan-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Plus className="w-3.5 h-3.5" /> Create Room
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('join')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'join'
                  ? 'bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ArrowRight className="w-3.5 h-3.5" /> Join Room
            </button>
          </div>

          {/* Developer Call-sign Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Developer Call-sign / Tag
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. Neo or Sarah"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-mono"
            />
          </div>

          {/* Create Form */}
          {activeTab === 'create' ? (
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Workspace Name
                </label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="e.g. Fullstack Microservices"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Room ID (Custom or Auto)
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateId}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" /> Auto-generate
                  </button>
                </div>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="Auto-generated if left blank"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-cyan-400 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Start CODE DEATH Room
              </button>
            </form>
          ) : (
            /* Join Form */
            <form onSubmit={handleJoinRoom} className="space-y-4">
              {inviteDetected && roomId && (
                <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/30 flex items-start gap-2 text-xs text-cyan-200">
                  <KeyRound className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-0.5 text-[11px]">
                    <span className="font-semibold text-cyan-300">Room Invite Detected</span>
                    <p className="text-cyan-400/80">
                      Room code <span className="font-mono font-bold text-white bg-slate-900/80 px-1 py-0.5 rounded border border-cyan-500/20">{roomId}</span> has been loaded. Click below to verify and enter the collaborative workspace.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Room Invite Code
                </label>
                <input
                  type="text"
                  required
                  value={roomId}
                  onChange={(e) => {
                    setRoomId(e.target.value);
                    if (inviteDetected) setInviteDetected(false);
                  }}
                  placeholder="Paste Room Code (e.g. dev-session-982)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-rose-400 placeholder-slate-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={isValidating}
                className="w-full py-3 bg-gradient-to-r from-rose-500 to-indigo-600 hover:from-rose-400 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-rose-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Verifying Room...
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4" /> Confirm & Join Room
                  </>
                )}
              </button>
            </form>
          )}

          {/* Active Rooms */}
          {recentRooms.length > 0 && (
            <div className="pt-3 border-t border-slate-800">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Active CODE DEATH Sessions</span>
                <span className="text-[10px] text-slate-500">Click to join</span>
              </div>
              <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                {recentRooms.map((r) => (
                  <button
                    key={r.roomId}
                    type="button"
                    onClick={() => {
                      setRoomId(r.roomId);
                      setActiveTab('join');
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 text-left text-xs transition-colors cursor-pointer"
                  >
                    <div className="truncate min-w-0 pr-2">
                      <span className="font-semibold text-slate-200 block truncate">
                        {r.roomname}
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {r.roomId}
                      </span>
                    </div>
                    <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20 flex-shrink-0">
                      {r.participantsCount} online
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 py-4 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-400">CODE DEATH</span>
          <span>•</span>
          <span>High-Performance Realtime Pair Programming</span>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-slate-600 font-mono">v3.0.0</span>
          <button onClick={logout} className="hover:text-rose-400 transition-colors">
            Sign Out
          </button>
        </div>
      </footer>
    </div>
  );
};
