import React, { useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import CodeMirror, { Extension } from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView, keymap } from '@codemirror/view';
import { undo as cmUndo, redo as cmRedo, selectAll as cmSelectAll } from '@codemirror/commands';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { SupportedLanguage, CursorPresence } from '../../types';

export interface EditorRefHandle {
  undo: () => boolean;
  redo: () => boolean;
  selectAll: () => boolean;
  cut: () => void;
  copy: () => void;
  paste: () => Promise<void>;
  focus: () => void;
  getEditorView: () => EditorView | null;
}

interface CodeEditorViewProps {
  code: string;
  language: SupportedLanguage;
  onChange: (value: string, viewUpdate?: any) => void;
  onCursorChange?: (line: number, col: number) => void;
  onSave?: () => void;
  onRun?: () => void;
  theme?: 'dark' | 'light';
  fontSize?: number;
  readOnly?: boolean;
  wordWrap?: boolean;
  remoteCursors?: CursorPresence[];
  ytext?: Y.Text | null;
  awareness?: Awareness | null;
  undoManager?: Y.UndoManager | null;
  docId?: string;
  targetLine?: number | null;
}

export const CodeEditorView = forwardRef<EditorRefHandle, CodeEditorViewProps>(({
  code,
  language,
  onChange,
  onCursorChange,
  onSave,
  onRun,
  theme = 'dark',
  fontSize = 13,
  readOnly = false,
  wordWrap = false,
  remoteCursors = [],
  docId,
  targetLine,
}, ref) => {
  const editorViewRef = useRef<EditorView | null>(null);

  useImperativeHandle(ref, () => ({
    undo: () => {
      if (editorViewRef.current) {
        return cmUndo(editorViewRef.current);
      }
      return false;
    },
    redo: () => {
      if (editorViewRef.current) {
        return cmRedo(editorViewRef.current);
      }
      return false;
    },
    selectAll: () => {
      if (editorViewRef.current) {
        return cmSelectAll(editorViewRef.current);
      }
      return false;
    },
    cut: () => {
      if (!editorViewRef.current) return;
      const state = editorViewRef.current.state;
      const { from, to } = state.selection.main;
      if (from !== to) {
        const text = state.sliceDoc(from, to);
        navigator.clipboard.writeText(text);
        editorViewRef.current.dispatch({
          changes: { from, to, insert: '' },
        });
      }
    },
    copy: () => {
      if (!editorViewRef.current) return;
      const state = editorViewRef.current.state;
      const { from, to } = state.selection.main;
      if (from !== to) {
        const text = state.sliceDoc(from, to);
        navigator.clipboard.writeText(text);
      }
    },
    paste: async () => {
      if (!editorViewRef.current) return;
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          const state = editorViewRef.current.state;
          const { from, to } = state.selection.main;
          editorViewRef.current.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
          });
        }
      } catch (err) {
        console.warn('Clipboard read permission denied or unavailable:', err);
      }
    },
    focus: () => {
      editorViewRef.current?.focus();
    },
    getEditorView: () => editorViewRef.current,
  }));


  useEffect(() => {
    if (!targetLine || !editorViewRef.current) return;
    try {
      const state = editorViewRef.current.state;
      const lineCount = state.doc.lines;
      const clampedLine = Math.max(1, Math.min(targetLine, lineCount));
      const lineObj = state.doc.line(clampedLine);
      editorViewRef.current.dispatch({
        selection: { anchor: lineObj.from, head: lineObj.from },
        scrollIntoView: true,
      });
      editorViewRef.current.focus();
    } catch (e) {
      console.warn('Could not scroll to target line:', e);
    }
  }, [targetLine]);

  const extensions = useMemo(() => {
    const exts: Extension[] = [];

    // Language syntax mode
    switch (language) {
      case 'javascript':
        exts.push(javascript({ jsx: true, typescript: false }));
        break;
      case 'typescript':
        exts.push(javascript({ jsx: true, typescript: true }));
        break;
      case 'python':
        exts.push(python());
        break;
      case 'html':
        exts.push(html());
        break;
      case 'css':
        exts.push(css());
        break;
      case 'java':
        exts.push(java());
        break;
      case 'cpp':
        exts.push(cpp());
        break;
      case 'json':
        exts.push(json());
        break;
      case 'markdown':
        exts.push(markdown());
        break;
      default:
        exts.push(javascript({ jsx: true, typescript: false }));
    }

    // Line wrapping when enabled, horizontal scrolling when disabled
    if (wordWrap) {
      exts.push(EditorView.lineWrapping);
    }

    // Custom Keybindings (Ctrl+S for save, Ctrl+Enter for run)
    const customKeymaps = keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          onSave?.();
          return true;
        },
      },
      {
        key: 'Mod-Enter',
        run: () => {
          onRun?.();
          return true;
        },
      },
    ]);
    exts.push(customKeymaps);

    // Editor styling matching VS Code Dark+ / Light+
    const themeStyles = EditorView.theme({
      '&': {
        height: '100% !important',
        fontSize: `${fontSize}px`,
        backgroundColor: theme === 'dark' ? '#0b0f19' : '#ffffff',
        color: theme === 'dark' ? '#d4d4d4' : '#1e293b',
      },
      '.cm-scroller': {
        overflow: 'auto !important',
        height: '100% !important',
        fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, "Courier New", monospace',
        lineHeight: '1.6',
      },
      '.cm-content': {
        paddingBottom: '120px',
      },
      '.cm-gutters': {
        backgroundColor: theme === 'dark' ? '#0b0f19' : '#f8fafc',
        color: theme === 'dark' ? '#4b5563' : '#94a3b8',
        borderRight: theme === 'dark' ? '1px solid #1e293b' : '1px solid #e2e8f0',
        minHeight: '100%',
      },
      '.cm-activeLine': {
        backgroundColor: theme === 'dark' ? 'rgba(56, 189, 248, 0.07)' : 'rgba(56, 189, 248, 0.1)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: theme === 'dark' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(56, 189, 248, 0.15)',
        color: '#38bdf8',
        fontWeight: 'bold',
      },
      '.cm-cursor': {
        borderLeftColor: '#38bdf8',
        borderLeftWidth: '2px',
      },
      '.cm-selectionBackground, ::selection': {
        backgroundColor: theme === 'dark' ? '#264f78' : '#add6ff',
      },
    });
    exts.push(themeStyles);

    return exts;
  }, [language, theme, fontSize, wordWrap, onSave, onRun]);

  const handleUpdate = (viewUpdate: any) => {
    if (viewUpdate.selectionSet && onCursorChange) {
      const state = viewUpdate.state;
      const head = state.selection.main.head;
      const line = state.doc.lineAt(head);
      onCursorChange(line.number, head - line.from + 1);
    }
  };

  return (
    <div className="relative w-full h-full min-h-0 min-w-0 flex-1 flex flex-col bg-slate-950 overflow-hidden">
      {/* Remote Peer Cursors Banner */}
      {remoteCursors.length > 0 && (
        <div className="absolute top-2 right-4 z-10 flex items-center space-x-1.5 pointer-events-none opacity-85">
          {remoteCursors.map((cursor) => (
            <span
              key={cursor.userId}
              className="px-2 py-0.5 rounded-full text-[10px] font-bold text-slate-950 shadow-md flex items-center gap-1"
              style={{ backgroundColor: cursor.userColor || '#38bdf8' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />
              <span>{cursor.username} (Ln {cursor.line})</span>
            </span>
          ))}
        </div>
      )}

      {/* CodeMirror v6 Instance */}
      <div className="flex-1 min-h-0 min-w-0 w-full h-full flex flex-col relative">
        <CodeMirror
          key={docId || 'editor-default'}
          value={code ?? ''}
          height="100%"
          className="h-full w-full flex-1 min-h-0 flex flex-col"
          extensions={extensions}
          theme={theme === 'dark' ? 'dark' : 'light'}
          readOnly={readOnly}
          onChange={onChange}
          onUpdate={handleUpdate}
          onCreateEditor={(view) => {
            editorViewRef.current = view;
          }}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightSpecialChars: true,
            history: true,
            foldGutter: true,
            drawSelection: true,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            syntaxHighlighting: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            closeBracketsKeymap: true,
            searchKeymap: true,
            historyKeymap: true,
            foldKeymap: true,
            completionKeymap: true,
            lintKeymap: true,
          }}
        />
      </div>
    </div>
  );
});
