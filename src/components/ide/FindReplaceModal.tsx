import React, { useState, useEffect, useRef, useMemo, FC } from 'react';
import { Search, Replace, ChevronDown, ChevronUp, X, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface FindReplaceModalProps {
  isOpen: boolean;
  mode: 'find' | 'replace';
  onClose: () => void;
  currentContent: string;
  onApplyContent: (newContent: string) => void;
}

export const FindReplaceModal: FC<FindReplaceModalProps> = ({
  isOpen,
  mode = 'find',
  onClose,
  currentContent,
  onApplyContent,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Compute matches
  const matches = useMemo(() => {
    if (!searchTerm) return [];
    const flags = caseSensitive ? 'g' : 'gi';
    try {
      const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      const results: number[] = [];
      let match;
      while ((match = regex.exec(currentContent)) !== null) {
        results.push(match.index);
      }
      return results;
    } catch {
      return [];
    }
  }, [searchTerm, currentContent, caseSensitive]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchTerm, caseSensitive]);

  if (!isOpen) return null;

  const handleFindNext = () => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
  };

  const handleFindPrev = () => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
  };

  const handleReplaceOne = () => {
    if (!searchTerm || matches.length === 0) return;
    const targetIdx = matches[currentMatchIndex];
    if (targetIdx === undefined) return;

    const before = currentContent.slice(0, targetIdx);
    const after = currentContent.slice(targetIdx + searchTerm.length);
    const updated = before + replaceTerm + after;
    onApplyContent(updated);
    toast.success('Replaced 1 occurrence');
  };

  const handleReplaceAll = () => {
    if (!searchTerm || matches.length === 0) return;
    const flags = caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    const updated = currentContent.replace(regex, replaceTerm);
    onApplyContent(updated);
    toast.success(`Replaced ${matches.length} occurrence(s)`);
  };

  return (
    <div
      className="fixed top-12 right-6 z-50 w-80 sm:w-96 bg-slate-900/95 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-md p-3 text-slate-100 font-sans select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
          <Search className="w-3.5 h-3.5 text-cyan-400" />
          <span>{mode === 'replace' ? 'Find & Replace' : 'Find in File'}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2.5 pt-2.5">
        {/* Search input row */}
        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 focus-within:border-cyan-500">
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFindNext();
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Search..."
            className="flex-1 bg-transparent border-none text-xs text-slate-100 placeholder-slate-500 focus:outline-none font-mono"
          />
          <div className="flex items-center gap-1 text-[10px] text-slate-400 pl-1">
            <span>
              {matches.length > 0 ? `${currentMatchIndex + 1}/${matches.length}` : 'No matches'}
            </span>
            <button
              onClick={() => setCaseSensitive(!caseSensitive)}
              className={`px-1 rounded border text-[9px] font-mono cursor-pointer ${
                caseSensitive
                  ? 'border-cyan-400 text-cyan-400 bg-cyan-950/40'
                  : 'border-slate-700 text-slate-500'
              }`}
              title="Match Case (Aa)"
            >
              Aa
            </button>
          </div>
        </div>

        {/* Replace input row (if replace mode) */}
        {mode === 'replace' && (
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 focus-within:border-indigo-500">
            <input
              type="text"
              value={replaceTerm}
              onChange={(e) => setReplaceTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleReplaceOne();
                if (e.key === 'Escape') onClose();
              }}
              placeholder="Replace with..."
              className="flex-1 bg-transparent border-none text-xs text-slate-100 placeholder-slate-500 focus:outline-none font-mono"
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-between gap-1.5 pt-1">
          <div className="flex items-center gap-1">
            <button
              onClick={handleFindPrev}
              disabled={matches.length === 0}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Previous Match"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleFindNext}
              disabled={matches.length === 0}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Next Match"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {mode === 'replace' ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleReplaceOne}
                disabled={matches.length === 0}
                className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer font-medium"
              >
                Replace
              </button>
              <button
                onClick={handleReplaceAll}
                disabled={matches.length === 0}
                className="px-2.5 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer font-medium"
              >
                Replace All
              </button>
            </div>
          ) : (
            <span className="text-[10px] text-slate-500 font-mono">Press Enter for next</span>
          )}
        </div>
      </div>
    </div>
  );
};
