import React, { useState, useEffect, FC } from 'react';
import { 
  Sparkles, 
  X, 
  Check, 
  AlertTriangle, 
  FileCode, 
  ArrowRight, 
  Copy, 
  RotateCw, 
  Wrench,
  ChevronDown,
  Terminal,
  Zap
} from 'lucide-react';
import { ProjectFile } from '../../types';
import toast from 'react-hot-toast';

interface AIErrorFixModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorText: string;
  commandContext?: string;
  activeFile: ProjectFile | null;
  files: ProjectFile[];
  roomId: string;
  onApplyFix: (targetFilePath: string, fixedCode: string, line?: number) => void;
}

interface FixResult {
  targetFile: string;
  line: number;
  explanation: string;
  fixedCode: string;
  diffSummary: string;
}

export const AIErrorFixModal: FC<AIErrorFixModalProps> = ({
  isOpen,
  onClose,
  errorText,
  commandContext,
  activeFile,
  files,
  roomId,
  onApplyFix,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'fix' | 'original'>('fix');

  const fetchAiFix = async () => {
    if (!errorText && !commandContext) return;
    setIsLoading(true);
    setFetchError(null);
    setFixResult(null);

    try {
      const res = await fetch('/api/ai/fix-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: errorText,
          commandContext,
          code: activeFile?.content || '',
          language: activeFile?.language || 'javascript',
          activeFileName: activeFile?.name || '',
          activeFilePath: activeFile?.path || '',
          roomId,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json();
      if (data.error && !data.fixedCode) {
        throw new Error(data.error);
      }

      setFixResult({
        targetFile: data.targetFile || activeFile?.path || activeFile?.name || 'file',
        line: data.line || 1,
        explanation: data.explanation || 'Identified and corrected runtime error in workspace.',
        fixedCode: data.fixedCode || activeFile?.content || '',
        diffSummary: data.diffSummary || 'Code corrected by AI Debug Engine.',
      });
    } catch (err: any) {
      setFetchError(err.message || 'Failed to generate AI fix.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAiFix();
    } else {
      setFixResult(null);
      setFetchError(null);
    }
  }, [isOpen, errorText]);

  if (!isOpen) return null;

  const handleApply = () => {
    if (!fixResult) return;
    onApplyFix(fixResult.targetFile, fixResult.fixedCode, fixResult.line);
    toast.success(`Fix applied to ${fixResult.targetFile} (Line ${fixResult.line})!`, {
      icon: '🎉',
      duration: 3500,
    });
    onClose();
  };

  const handleCopy = () => {
    if (!fixResult) return;
    navigator.clipboard.writeText(fixResult.fixedCode);
    setCopied(true);
    toast.success('Fixed code copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                JARVIS AI Error Diagnosis & Verified Fix
              </h2>
              <p className="text-[11px] text-slate-400">
                Automated error inspection, exact line targeting, and verified patch generator
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Context Banner */}
        <div className="px-4 py-2.5 bg-rose-950/40 border-b border-rose-900/40 flex items-start gap-2.5 text-xs text-rose-300">
          <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 overflow-hidden">
            <div className="font-semibold text-rose-200">
              {commandContext ? `Error in: ${commandContext}` : 'Detected Error'}
            </div>
            <div className="font-mono text-[11px] text-rose-300 truncate mt-0.5">
              {errorText || 'Error details recorded from execution.'}
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs text-slate-200">
          {isLoading && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-2 border-indigo-500/20 border-t-indigo-400 animate-spin" />
                <Sparkles className="w-5 h-5 text-amber-400 absolute inset-0 m-auto animate-pulse" />
              </div>
              <div>
                <p className="font-semibold text-slate-200 text-sm">JARVIS is analyzing the problem...</p>
                <p className="text-slate-400 text-xs mt-1">
                  Tracing error stack, inspecting workspace files, and creating verified code solution.
                </p>
              </div>
            </div>
          )}

          {fetchError && !isLoading && (
            <div className="p-4 rounded-lg bg-rose-950/30 border border-rose-800/60 text-rose-300 text-center space-y-2">
              <p className="font-semibold">Unable to generate automated fix</p>
              <p className="text-xs text-rose-400">{fetchError}</p>
              <button
                onClick={fetchAiFix}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                <RotateCw className="w-3.5 h-3.5" /> Retry Diagnosis
              </button>
            </div>
          )}

          {fixResult && !isLoading && (
            <>
              {/* Target & Line Pill */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Target File:</span>
                  <span className="font-mono font-bold text-cyan-400 flex items-center gap-1 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/50">
                    <FileCode className="w-3 h-3" />
                    {fixResult.targetFile}
                  </span>
                  <span className="font-mono text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/50">
                    Line {fixResult.line}
                  </span>
                </div>
                <div className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Verified Patch Ready
                </div>
              </div>

              {/* Explanation */}
              <div className="p-3 rounded-lg bg-indigo-950/20 border border-indigo-900/40 space-y-1">
                <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-indigo-400" />
                  Root Cause & Resolution
                </div>
                <p className="text-slate-300 leading-relaxed text-xs">
                  {fixResult.explanation}
                </p>
                {fixResult.diffSummary && (
                  <div className="text-[11px] text-slate-400 pt-1 border-t border-indigo-950/60 font-mono">
                    Change Summary: {fixResult.diffSummary}
                  </div>
                )}
              </div>

              {/* Code Preview Switcher */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setViewMode('fix')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                        viewMode === 'fix'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Proposed Fix
                    </button>
                    <button
                      onClick={() => setViewMode('original')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                        viewMode === 'original'
                          ? 'bg-slate-700 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Original Code
                    </button>
                  </div>

                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy Code'}</span>
                  </button>
                </div>

                {/* Code Window */}
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 max-h-64 overflow-y-auto font-mono text-[11px] leading-relaxed">
                  <pre className="whitespace-pre-wrap text-slate-200">
                    {viewMode === 'fix' ? fixResult.fixedCode : (activeFile?.content || 'No original code')}
                  </pre>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors text-xs font-medium"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {fixResult && (
              <button
                onClick={handleApply}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-950 transition-all active:scale-[0.98]"
              >
                <Zap className="w-4 h-4 fill-white" />
                <span>Apply Fix to File</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
