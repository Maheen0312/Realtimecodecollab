import React, { useState, useEffect, useRef, FC, FormEvent } from 'react';
import { Hash, ArrowRight } from 'lucide-react';

interface GoToLineModalProps {
  isOpen: boolean;
  onClose: () => void;
  maxLines: number;
  onGoToLine: (line: number) => void;
}

export const GoToLineModal: FC<GoToLineModalProps> = ({
  isOpen,
  onClose,
  maxLines,
  onGoToLine,
}) => {
  const [lineInput, setLineInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setLineInput('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const lineNum = parseInt(lineInput, 10);
    if (!isNaN(lineNum) && lineNum >= 1) {
      onGoToLine(Math.min(lineNum, Math.max(1, maxLines)));
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-[14vh] z-50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden text-slate-100 flex flex-col font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="flex items-center px-4 py-3 bg-slate-950/60">
          <Hash className="w-4 h-4 text-cyan-400 mr-2 flex-shrink-0" />
          <input
            ref={inputRef}
            type="number"
            min="1"
            max={maxLines || 9999}
            value={lineInput}
            onChange={(e) => setLineInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
            placeholder={`Type line number (1 - ${maxLines || 1})...`}
            className="flex-1 bg-transparent border-none text-sm text-slate-100 placeholder-slate-500 focus:outline-none font-mono"
          />
          <button
            type="submit"
            className="ml-2 px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded cursor-pointer flex items-center gap-1"
          >
            Go <ArrowRight className="w-3 h-3" />
          </button>
        </form>
      </div>
    </div>
  );
};
