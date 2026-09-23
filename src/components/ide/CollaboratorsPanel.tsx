import React, { useState, FC } from 'react';
import { 
  Users, 
  Crown, 
  Circle, 
  Share2, 
  UserMinus, 
  Shield, 
  Trash2, 
  LogOut, 
  Lock, 
  Unlock,
  FileCode,
  Check,
  Eye,
  Edit3
} from 'lucide-react';
import { Client, ProjectFile } from '../../types';
import toast from 'react-hot-toast';
import { ShareRoomModal } from './ShareRoomModal';

interface CollaboratorsPanelProps {
  clients: Client[];
  currentUsername: string;
  isHost: boolean;
  roomId: string;
  files: ProjectFile[];
  roomHostId?: string | null;
  currentUserUid?: string | null;
  onKickUser?: (targetSocketId: string, targetUsername: string, targetUserId?: string) => void;
  onTransferHost?: (targetSocketId: string, targetUsername: string, targetUserId?: string) => void;
  onTogglePermissions?: (isReadOnly: boolean) => void;
  onDeleteRoom?: () => void;
  onLeaveRoom: () => void;
  isReadOnly?: boolean;
}

export const CollaboratorsPanel: FC<CollaboratorsPanelProps> = ({
  clients,
  currentUsername,
  isHost,
  roomId,
  files,
  roomHostId,
  currentUserUid,
  onKickUser,
  onTransferHost,
  onTogglePermissions,
  onDeleteRoom,
  onLeaveRoom,
  isReadOnly = false,
}) => {
  const [showShareModal, setShowShareModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const getActiveFileName = (activeFileId?: string) => {
    if (!activeFileId) return 'Idle';
    const found = files.find((f) => f.id === activeFileId);
    return found ? found.name : 'Browsing';
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/90 text-slate-200 font-sans select-none">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Users className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            COLLABORATORS ({clients.length})
          </span>
        </div>
        <span className="flex items-center text-[10px] text-emerald-400 gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
          <Circle className="w-1.5 h-1.5 fill-emerald-400 animate-pulse" /> Live
        </span>
      </div>

      {/* Room ID Share Bar */}
      <div className="p-2.5 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="truncate min-w-0">
          <span className="text-[10px] text-slate-500 block uppercase font-mono">Room ID</span>
          <span className="text-xs font-mono font-semibold text-cyan-300 truncate block">
            {roomId}
          </span>
        </div>
        <button
          onClick={() => setShowShareModal(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer transition-colors"
          title="Share room & invite collaborators"
        >
          <Share2 className="w-3.5 h-3.5 text-cyan-400" />
          <span>Invite</span>
        </button>
      </div>

      <ShareRoomModal
        roomId={roomId}
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
      />

      {/* Collaborators List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {clients.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs">
            Connecting collaborators...
          </div>
        ) : (
          clients.map((client) => {
            const isMe = Boolean(
              (currentUserUid && client.userId && currentUserUid === client.userId) ||
              (client.username === currentUsername)
            );
            const isClientHost = Boolean(
              (client.userId && roomHostId && client.userId === roomHostId) ||
              client.isHost ||
              (isMe && isHost)
            );
            const initial = (client.username || 'U').charAt(0).toUpperCase();
            const avatarBg = client.userColor || '#38bdf8';
            const activeFileName = getActiveFileName(client.activeFileId);

            return (
              <div
                key={client.socketId || client.userId || client.username}
                className={`p-2.5 rounded-xl border transition-all ${
                  isMe
                    ? 'bg-slate-800/80 border-cyan-500/40 shadow-sm'
                    : 'bg-slate-800/30 border-slate-800/80 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0"
                      style={{ backgroundColor: avatarBg }}
                    >
                      {initial}
                    </div>
                    <div className="truncate min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-200 truncate">
                          {client.username}
                        </span>
                        {isMe && (
                          <span className="text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-1 rounded font-mono">
                            YOU
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 truncate">
                        <span className={`w-1.5 h-1.5 rounded-full ${isClientHost ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse flex-shrink-0`} />
                        <span className="font-mono text-slate-300 font-medium">
                          {isClientHost ? 'HOST • Online' : isReadOnly ? 'VIEWER • Online' : 'MEMBER • Online'}
                        </span>
                        <span className="text-slate-600">•</span>
                        <FileCode className="w-2.5 h-2.5 text-slate-500 flex-shrink-0" />
                        <span className="truncate max-w-[80px]">{activeFileName}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {isClientHost ? (
                      <span className="flex items-center gap-1 text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-md font-semibold tracking-wide shadow-sm">
                        <Crown className="w-3 h-3 text-amber-400 fill-amber-400/30" /> HOST
                      </span>
                    ) : isReadOnly ? (
                      <span className="flex items-center gap-1 text-[10px] bg-slate-800 text-slate-400 border border-slate-700/60 px-1.5 py-0.5 rounded-md font-mono">
                        <Eye className="w-2.5 h-2.5 text-slate-400" /> VIEWER
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] bg-cyan-950/40 text-cyan-300 border border-cyan-800/40 px-1.5 py-0.5 rounded-md font-mono">
                        <Edit3 className="w-2.5 h-2.5 text-cyan-400" /> MEMBER
                      </span>
                    )}
                  </div>
                </div>

                {/* Host Actions on peer: only visible to Host, and only on non-host peers */}
                {isHost && !isClientHost && !isMe && (
                  <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-end gap-1.5 text-[10px]">
                    <button
                      onClick={() => onTransferHost?.(client.socketId, client.username, client.userId)}
                      className="px-2.5 py-1 rounded bg-amber-950/30 hover:bg-amber-900/50 text-amber-300 hover:text-amber-200 border border-amber-800/40 flex items-center gap-1 cursor-pointer transition-colors font-medium"
                      title={`Make ${client.username} the room host`}
                    >
                      <Crown className="w-3 h-3 text-amber-400" /> Make Host
                    </button>
                    <button
                      onClick={() => onKickUser?.(client.socketId, client.username, client.userId)}
                      className="px-2.5 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-200 border border-rose-800/40 flex items-center gap-1 cursor-pointer transition-colors font-medium"
                      title={`Kick ${client.username} from session`}
                    >
                      <UserMinus className="w-3 h-3 text-rose-400" /> Kick
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Host Controls & Actions Panel */}
      {isHost && (
        <div className="p-3 border-t border-slate-800 bg-slate-950/40 space-y-2.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <span className="flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-cyan-400" /> Room Permissions
            </span>
            <button
              onClick={() => onTogglePermissions?.(!isReadOnly)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                isReadOnly
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {isReadOnly ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
              <span>{isReadOnly ? 'Read-Only Mode' : 'Read & Write'}</span>
            </button>
          </div>

          {/* Delete Room Section */}
          <div className="pt-1">
            {confirmDelete ? (
              <div className="p-2 rounded bg-rose-950/50 border border-rose-800 text-[11px] space-y-1.5">
                <span className="text-rose-200 font-semibold block">Delete this workspace for all users?</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onDeleteRoom?.()}
                    className="flex-1 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer"
                  >
                    Yes, Delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full py-1.5 rounded bg-rose-950/30 hover:bg-rose-950/60 border border-rose-900/50 text-rose-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Room
              </button>
            )}
          </div>
        </div>
      )}

      {/* Leave Room Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/80">
        <button
          onClick={onLeaveRoom}
          className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 text-slate-400" /> Leave Workspace
        </button>
      </div>
    </div>
  );
};
