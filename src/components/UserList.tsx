import React, { FC } from 'react';
import { Client } from '../types';
import { Users, Crown, Circle } from 'lucide-react';

interface UserListProps {
  clients: Client[];
  currentUsername: string;
}

export const UserList: FC<UserListProps> = ({ clients, currentUsername }) => {
  return (
    <div className="flex flex-col h-full bg-slate-900/70 border-r border-slate-800 text-slate-200">
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Users className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Collaborators ({clients.length})
          </span>
        </div>
        <span className="flex items-center text-xs text-emerald-400 gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
          <Circle className="w-2 h-2 fill-emerald-400 animate-pulse" /> Live
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {clients.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-xs">
            Connecting collaborators...
          </div>
        ) : (
          clients.map((client) => {
            const isMe = client.username === currentUsername;
            const initial = (client.username || 'U').charAt(0).toUpperCase();
            const avatarBg = client.userColor || '#38bdf8';

            return (
              <div
                key={client.socketId}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
                  isMe
                    ? 'bg-slate-800/90 border-sky-500/30 shadow-sm'
                    : 'bg-slate-800/40 border-slate-800/80 hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0"
                    style={{ backgroundColor: avatarBg }}
                  >
                    {initial}
                  </div>
                  <div className="truncate">
                    <span className="text-sm font-medium text-slate-200 block truncate">
                      {client.username}
                    </span>
                    {isMe && (
                      <span className="text-[10px] text-sky-400 font-semibold tracking-wide">
                        You
                      </span>
                    )}
                  </div>
                </div>

                {client.isHost && (
                  <div className="flex items-center gap-1 text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded flex-shrink-0">
                    <Crown className="w-3 h-3" /> Host
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
