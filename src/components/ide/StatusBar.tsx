import React, { FC } from 'react';
import { 
  GitBranch, 
  AlertCircle, 
  AlertTriangle, 
  Users, 
  Bell, 
  CheckCircle2, 
  RefreshCw, 
  Radio
} from 'lucide-react';
import { ConnectionStatus, SupportedLanguage } from '../../types';

interface StatusBarProps {
  roomId: string;
  roomname: string;
  language: SupportedLanguage;
  connectionStatus: ConnectionStatus;
  cursorLine: number;
  cursorCol: number;
  errorCount: number;
  warningCount: number;
  participantCount: number;
  onToggleTerminal: () => void;
}

export const StatusBar: FC<StatusBarProps> = ({
  roomId,
  language,
  connectionStatus,
  cursorLine,
  cursorCol,
  errorCount,
  warningCount,
  participantCount,
  onToggleTerminal,
}) => {
  const getStatusBadge = () => {
    switch (connectionStatus) {
      case 'connected':
        return (
          <span className="flex items-center space-x-1 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            <span>Connected</span>
          </span>
        );
      case 'syncing':
        return (
          <span className="flex items-center space-x-1 text-amber-400">
            <RefreshCw className="w-2.5 h-2.5 animate-spin" />
            <span>Syncing</span>
          </span>
        );
      case 'reconnecting':
        return (
          <span className="flex items-center space-x-1 text-amber-500">
            <Radio className="w-2.5 h-2.5 animate-pulse" />
            <span>Reconnecting</span>
          </span>
        );
      case 'offline':
      default:
        return (
          <span className="flex items-center space-x-1 text-rose-400">
            <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
            <span>Offline</span>
          </span>
        );
    }
  };

  return (
    <footer 
      className="h-6 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400 px-3 flex items-center justify-between select-none z-20"
      aria-label="Status Bar"
    >
      {/* Left items */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onToggleTerminal}
          className="flex items-center space-x-1 hover:text-slate-200 transition-colors"
          title="Git Room Status"
        >
          <GitBranch className="w-3 h-3 text-sky-400" />
          <span className="font-mono">{roomId}</span>
        </button>

        <button
          onClick={onToggleTerminal}
          className="flex items-center space-x-2 hover:text-slate-200 transition-colors"
          title="Problems Panel"
        >
          <span className="flex items-center space-x-0.5 text-slate-400 hover:text-rose-400">
            <AlertCircle className="w-3 h-3 text-rose-400" />
            <span>{errorCount}</span>
          </span>
          <span className="flex items-center space-x-0.5 text-slate-400 hover:text-amber-400">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span>{warningCount}</span>
          </span>
        </button>

        <div className="hidden sm:flex items-center space-x-1 text-slate-400">
          <Users className="w-3 h-3 text-sky-400" />
          <span>{participantCount} {participantCount === 1 ? 'peer' : 'peers'} online</span>
        </div>
      </div>

      {/* Right items */}
      <div className="flex items-center space-x-4 font-mono">
        <span className="hidden md:inline">
          Ln {cursorLine}, Col {cursorCol}
        </span>
        <span className="hidden md:inline">Spaces: 2</span>
        <span className="hidden sm:inline">UTF-8</span>
        <span className="uppercase text-sky-300 font-semibold">{language}</span>
        <div title={`Connection: ${connectionStatus}`}>
          {getStatusBadge()}
        </div>
      </div>
    </footer>
  );
};
