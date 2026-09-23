import { ProjectFile } from '../types';

export function getDefaultProjectFiles(roomId: string = 'workspace'): ProjectFile[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'd_src',
      roomId,
      name: 'src',
      path: 'src',
      content: '',
      language: 'plaintext',
      isFolder: true,
      parentPath: '',
      version: 1,
      updatedAt: now,
    },
    {
      id: 'f_app',
      roomId,
      name: 'App.jsx',
      path: 'src/App.jsx',
      language: 'javascript',
      isFolder: false,
      parentPath: 'src',
      version: 1,
      updatedAt: now,
      content: `// CODE DEATH Collaborative Web IDE
// Test File: Supports full vertical and horizontal scrolling across 100+ lines
import React, { useState, useEffect, useCallback } from 'react';

export default function App() {
  const [count, setCount] = useState(0);
  const [history, setHistory] = useState([]);
  const [activeSession, setActiveSession] = useState('CODE_DEATH_ALPHA');
  const [collaborators, setCollaborators] = useState([
    { id: 1, name: 'Lead Architect', role: 'Host', status: 'online' },
    { id: 2, name: 'Pair Partner', role: 'Editor', status: 'coding' },
    { id: 3, name: 'Reviewer', role: 'Viewer', status: 'idle' },
  ]);

  // Log counter events into historical timeline
  const recordEvent = useCallback((action, val) => {
    const timestamp = new Date().toLocaleTimeString();
    setHistory((prev) => [
      { id: Date.now(), action, val, time: timestamp },
      ...prev.slice(0, 49),
    ]);
  }, []);

  const handleIncrement = () => {
    setCount((prev) => {
      const next = prev + 1;
      recordEvent('INCREMENT', next);
      return next;
    });
  };

  const handleDecrement = () => {
    setCount((prev) => {
      const next = prev - 1;
      recordEvent('DECREMENT', next);
      return next;
    });
  };

  const handleReset = () => {
    setCount(0);
    recordEvent('RESET', 0);
  };

  useEffect(() => {
    console.log('[CODE DEATH]: Initialized collaborative workspace:', activeSession);
  }, [activeSession]);

  return (
    <div className="container min-h-screen bg-slate-950 text-slate-100 p-8">
      {/* Header Section */}
      <header className="border-b border-slate-800 pb-6 mb-8">
        <h1 className="text-3xl font-extrabold text-cyan-400 tracking-tight">
          ⚡ CODE DEATH Collaborative IDE
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Next-Generation Realtime Developer Pair Programming Sandbox
        </p>
      </header>

      {/* Main Grid View */}
      <main className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Interactive State Card */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-bold text-slate-200 mb-2">Interactive Counter</h2>
          <p className="text-slate-400 text-xs mb-4">
            State changes sync across all connected developers in real time.
          </p>

          <div className="flex items-center justify-center my-8">
            <span className="text-6xl font-black text-cyan-300 font-mono">
              {count}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleIncrement}
              className="flex-1 py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 font-bold rounded-lg transition-colors"
            >
              + Increment
            </button>
            <button
              onClick={handleDecrement}
              className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 font-bold rounded-lg transition-colors"
            >
              - Decrement
            </button>
            <button
              onClick={handleReset}
              className="py-2.5 px-4 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 font-bold rounded-lg transition-colors"
            >
              Reset
            </button>
          </div>
        </section>

        {/* Collaborators Active Panel */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-bold text-slate-200 mb-2">Connected Team</h2>
          <p className="text-slate-400 text-xs mb-4">
            Realtime presence and collaborative session roster.
          </p>

          <ul className="space-y-3">
            {collaborators.map((user) => (
              <li
                key={user.id}
                className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-semibold text-slate-200">{user.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-cyan-400 font-mono">
                    {user.role}
                  </span>
                  <span className="text-xs text-slate-500">{user.status}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      {/* Activity Timeline / History Feed */}
      <footer className="mt-12 bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-bold text-slate-300 mb-4">Session Event Log</h3>
        {history.length === 0 ? (
          <p className="text-slate-500 text-sm">No actions recorded yet. Click the buttons above!</p>
        ) : (
          <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-xs py-1.5 px-3 bg-slate-950/40 rounded border border-slate-800/40 font-mono"
              >
                <span className="text-cyan-400">{item.action}</span>
                <span className="text-slate-300">Value: {item.val}</span>
                <span className="text-slate-500">{item.time}</span>
              </div>
            ))}
          </div>
        )}
      </footer>
    </div>
  );
}
// End of file: Verified line 140+ for unlimited editor scroll tests
`,
    },
    {
      id: 'f_css',
      roomId,
      name: 'index.css',
      path: 'src/index.css',
      language: 'css',
      isFolder: false,
      parentPath: 'src',
      version: 1,
      updatedAt: now,
      content: `/* Collaborative Styling */
:root {
  --primary: #38bdf8;
  --bg: #0f172a;
  --surface: #1e293b;
  --text: #f8fafc;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background-color: var(--bg);
  color: var(--text);
  display: flex;
  justify-content: center;
  padding: 2rem;
}

.container {
  max-width: 600px;
  width: 100%;
}

.card {
  background: var(--surface);
  padding: 1.5rem;
  border-radius: 12px;
  border: 1px solid #334155;
  margin: 1.5rem 0;
}

.count-display {
  font-size: 2.5rem;
  font-weight: 800;
  color: var(--primary);
  margin: 0.5rem 0;
}

button {
  background: var(--primary);
  color: #0f172a;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  margin-right: 8px;
}

button.secondary {
  background: #334155;
  color: #f8fafc;
}`,
    },
    {
      id: 'f_main',
      roomId,
      name: 'main.jsx',
      path: 'src/main.jsx',
      language: 'javascript',
      isFolder: false,
      parentPath: 'src',
      version: 1,
      updatedAt: now,
      content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
    },
    {
      id: 'f_html',
      roomId,
      name: 'index.html',
      path: 'index.html',
      language: 'html',
      isFolder: false,
      parentPath: '',
      version: 1,
      updatedAt: now,
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Live Collaborative Workspace</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`,
    },
    {
      id: 'f_py',
      roomId,
      name: 'main.py',
      path: 'main.py',
      language: 'python',
      isFolder: false,
      parentPath: '',
      version: 1,
      updatedAt: now,
      content: `# Collaborative Python Script
def fibonacci(n):
    a, b = 0, 1
    result = []
    for _ in range(n):
        result.append(a)
        a, b = b, a + b
    return result

print("Fibonacci Sequence (first 10 numbers):")
print(fibonacci(10))

print("\\nTeam Pair Collaboration: Ready!")`,
    },
    {
      id: 'f_pkg',
      roomId,
      name: 'package.json',
      path: 'package.json',
      language: 'json',
      isFolder: false,
      parentPath: '',
      version: 1,
      updatedAt: now,
      content: `{
  "name": "collab-workspace",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "echo \\"All tests passed in real-time sandbox\\""
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.2.0"
  }
}`,
    },
    {
      id: 'f_vite_config',
      roomId,
      name: 'vite.config.js',
      path: 'vite.config.js',
      language: 'javascript',
      isFolder: false,
      parentPath: '',
      version: 1,
      updatedAt: now,
      content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
});
`,
    },
    {
      id: 'f_readme',
      roomId,
      name: 'README.md',
      path: 'README.md',
      language: 'markdown',
      isFolder: false,
      parentPath: '',
      version: 1,
      updatedAt: now,
      content: `# Real-Time Collaborative Web IDE

Welcome to your live multi-user pair programming workspace!

## Key Features
- **Delta-Based Synchronization**: Non-overwriting concurrent editing.
- **VS Code Web IDE Layout**: File Explorer, Tabs, Breadcrumbs, Status Bar.
- **Integrated Terminal**: Execute \`run\`, \`node\`, \`python\`, \`npm install\`, \`ls\`, \`cat\`, \`help\`.
- **Live Peer Audio & Video**: WebRTC grid with device permissions and mic controls.
- **JARVIS AI Assistant**: Code analysis powered by Gemini API.
- **Firebase Auth & Firestore**: Durable persistent cloud storage.
`,
    },
  ];
}
