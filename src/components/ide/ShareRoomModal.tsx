import React, { useState, FC } from 'react';
import { X, Copy, Check, Share2, Link, Shield, Users } from 'lucide-react';
import toast from 'react-hot-toast';

export interface ShareRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  roomName?: string;
}

export const ShareRoomModal: FC<ShareRoomModalProps> = ({
  isOpen,
  onClose,
  roomId,
  roomName,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  if (!isOpen) return null;

  const inviteUrl = `${window.location.origin}/room/${roomId}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      toast.success('Room link copied to clipboard!');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopiedId(true);
      toast.success('Room ID copied to clipboard!');
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      toast.error('Failed to copy Room ID');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div 
        className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-6 text-slate-100"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-wide">
                Invite Collaborators
              </h3>
              <p className="text-xs text-slate-400">
                {roomName ? `Room: ${roomName}` : 'Live pair programming session'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Shareable Invite Link
            </label>
            <div className="flex items-center space-x-2">
              <div className="flex-1 flex items-center bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 overflow-hidden">
                <Link className="w-3.5 h-3.5 mr-2 text-slate-500 shrink-0" />
                <span className="truncate">{inviteUrl}</span>
              </div>
              <button
                onClick={handleCopyLink}
                className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-medium transition-colors flex items-center space-x-1.5 shrink-0"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Room ID
            </label>
            <div className="flex items-center space-x-2">
              <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 select-all">
                {roomId}
              </div>
              <button
                onClick={handleCopyId}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors flex items-center space-x-1.5 shrink-0"
              >
                {copiedId ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                <span>{copiedId ? 'Copied' : 'Copy ID'}</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2 text-xs text-slate-400">
            <div className="flex items-center space-x-2 text-slate-300 font-medium">
              <Shield className="w-4 h-4 text-sky-400" />
              <span>Real-Time Collaboration Features</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-400">
              <li>Instant peer-to-peer code synchronization with conflict-free Yjs</li>
              <li>Multi-cursor presence with real-time colored user indicators</li>
              <li>Voice and video conferencing with screen share capabilities</li>
              <li>Integrated terminal, runtime debugger, and AI assistant</li>
            </ul>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
