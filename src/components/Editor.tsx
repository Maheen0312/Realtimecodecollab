import React, { useMemo, FC } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { SupportedLanguage } from '../types';

interface EditorProps {
  code: string;
  language: SupportedLanguage;
  onChange: (value: string) => void;
  fontSize?: number;
  readOnly?: boolean;
}

export const CodeEditor: FC<EditorProps> = ({
  code,
  language,
  onChange,
  fontSize = 14,
  readOnly = false,
}) => {
  // Select language extension
  const extensions = useMemo(() => {
    switch (language) {
      case 'javascript':
        return [javascript({ jsx: true, typescript: false })];
      case 'typescript':
        return [javascript({ jsx: true, typescript: true })];
      case 'python':
        return [python()];
      case 'java':
        return [java()];
      case 'cpp':
        return [cpp()];
      case 'html':
        return [html()];
      case 'css':
        return [css()];
      default:
        return [javascript()];
    }
  }, [language]);

  return (
    <div
      className="h-full w-full bg-[#1e1e2e] text-slate-100 overflow-hidden relative"
      style={{ fontSize: `${fontSize}px` }}
    >
      <CodeMirror
        value={code}
        height="100%"
        theme="dark"
        extensions={extensions}
        onChange={(val) => {
          onChange(val);
        }}
        readOnly={readOnly}
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
          defaultKeymap: true,
          searchKeymap: true,
          historyKeymap: true,
          foldKeymap: true,
          completionKeymap: true,
          lintKeymap: true,
        }}
        style={{
          height: '100%',
        }}
      />
    </div>
  );
};
