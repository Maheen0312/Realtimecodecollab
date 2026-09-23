import React, { FC, ReactNode } from 'react';
import { 
  Files, 
  Search, 
  Users2, 
  Bot, 
  Video, 
  Settings, 
  Terminal,
  Command,
  Sun,
  Moon
} from 'lucide-react';
import { ActivityBarView } from '../../types';

interface ActivityBarProps {
  activeView: ActivityBarView | null;
  onSelectView: (view: ActivityBarView) => void;
  onToggleTerminal: () => void;
  onOpenCommandPalette: () => void;
  participantCount: number;
  unreadChatCount?: number;
  isTerminalOpen: boolean;
  isVideoActive: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const ActivityBar: FC<ActivityBarProps> = ({
  activeView,
  onSelectView,
  onToggleTerminal,
  onOpenCommandPalette,
  participantCount,
  unreadChatCount = 0,
  isTerminalOpen,
  isVideoActive,
  theme,
  onToggleTheme,
}) => {
  const items: { view: ActivityBarView; label: string; icon: ReactNode; badge?: number }[] = [
    { view: 'explorer', label: 'Explorer (Ctrl+Shift+E)', icon: <Files className="w-5 h-5" /> },
    { view: 'search', label: 'Search in Workspace (Ctrl+Shift+F)', icon: <Search className="w-5 h-5" /> },
    { 
      view: 'collab', 
      label: `Collaborators (${participantCount} online)`, 
      icon: <Users2 className="w-5 h-5" />,
      badge: participantCount > 0 ? participantCount : undefined 
    },
    { 
      view: 'chat', 
      label: 'Team Chat & JARVIS AI', 
      icon: <Bot className="w-5 h-5" />,
      badge: unreadChatCount > 0 ? unreadChatCount : undefined
    },
    { 
      view: 'video', 
      label: isVideoActive ? 'Video Call (Active)' : 'Video & Audio Call', 
      icon: <Video className="w-5 h-5" /> 
    },
    { view: 'settings', label: 'IDE Settings', icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <aside 
      className="w-12 flex-shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col justify-between items-center py-2 z-20 select-none"
      aria-label="Activity Bar"
    >
      {/* Top View Switchers */}
      <div className="flex flex-col items-center space-y-1 w-full">
        {items.map((item) => {
          const isActive = activeView === item.view;
          return (
            <button
              key={item.view}
              title={item.label}
              onClick={() => onSelectView(item.view)}
              className={`relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors group ${
                isActive
                  ? 'text-sky-400 bg-slate-900 border-l-2 border-sky-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              {item.icon}
              {item.badge !== undefined && (
                <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-sky-500 text-[9px] font-bold text-slate-950 flex items-center justify-center shadow">
                  {item.badge}
                </span>
              )}
              {item.view === 'video' && isVideoActive && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Utility Tools */}
      <div className="flex flex-col items-center space-y-1.5 w-full">
        <button
          title="Command Palette (Ctrl+Shift+P / F1)"
          onClick={onOpenCommandPalette}
          className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 rounded-lg transition-colors"
        >
          <Command className="w-5 h-5" />
        </button>

        <button
          title={`Toggle Terminal (${isTerminalOpen ? 'Active' : 'Closed'})`}
          onClick={onToggleTerminal}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
            isTerminalOpen 
              ? 'text-emerald-400 bg-slate-900' 
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <Terminal className="w-5 h-5" />
        </button>

        <button
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`}
          onClick={onToggleTheme}
          className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-amber-300 hover:bg-slate-900/60 rounded-lg transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>
    </aside>
  );
};
