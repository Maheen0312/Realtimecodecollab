/**
 * Synthetic / Simulated MediaStream generator for virtual camera and microphone.
 * Useful when hardware camera/microphone are not present or fail with NotFoundError,
 * enabling full WebRTC video/audio peer-to-peer testing in headless/virtualized environments.
 */

export function createSimulatedMediaStream(options: {
  video?: boolean;
  audio?: boolean;
  username?: string;
  userColor?: string;
}): MediaStream {
  const stream = new MediaStream();

  // 1. Synthetic Video Track via Canvas
  if (options.video !== false) {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');

    const username = options.username || 'User';
    const userInitial = username.charAt(0).toUpperCase() || 'U';
    const accentColor = options.userColor || '#06b6d4';

    let frame = 0;
    const drawFrame = () => {
      if (!ctx) return;
      frame++;

      // Gradient background
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#090d16');
      grad.addColorStop(1, '#1e293b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Subtle animated grid / radar lines
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.08)';
      ctx.lineWidth = 1;
      const spacing = 40;
      for (let x = 0; x < canvas.width; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Animated glowing ring
      const cx = canvas.width / 2;
      const cy = canvas.height / 2 - 15;
      const pulse = Math.sin(frame * 0.05) * 6;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 52 + pulse, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Inner avatar circle
      ctx.beginPath();
      ctx.arc(cx, cy, 46, 0, Math.PI * 2);
      ctx.fillStyle = accentColor;
      ctx.fill();

      // User initial
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 38px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(userInitial, cx, cy);
      ctx.restore();

      // Username text
      ctx.fillStyle = '#f1f5f9';
      ctx.font = '600 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(username, cx, cy + 70);

      // Badge: "VIRTUAL AVATAR FEED"
      ctx.fillStyle = '#22d3ee';
      ctx.font = '500 11px system-ui, monospace';
      ctx.fillText('● SIMULATED CAMERA FEED', cx, cy + 92);
    };

    // Draw initial frame immediately
    drawFrame();
    const interval = setInterval(drawFrame, 1000 / 25);

    const canvasStream = canvas.captureStream ? canvas.captureStream(25) : (canvas as any).mozCaptureStream(25);
    const [videoTrack] = canvasStream.getVideoTracks();

    if (videoTrack) {
      // Clean up interval when track ends
      videoTrack.addEventListener('ended', () => {
        clearInterval(interval);
      });
      stream.addTrack(videoTrack);
    }
  }

  // 2. Synthetic Audio Track via Web Audio API (silent or low hum)
  if (options.audio !== false) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        gain.gain.value = 0.00001; // Silent / minimal placeholder to avoid speaker blare

        osc.connect(gain);
        const destination = audioCtx.createMediaStreamDestination();
        gain.connect(destination);
        osc.start();

        const [audioTrack] = destination.stream.getAudioTracks();
        if (audioTrack) {
          audioTrack.addEventListener('ended', () => {
            try {
              osc.stop();
              audioCtx.close();
            } catch {
              // Ignore cleanup issues
            }
          });
          stream.addTrack(audioTrack);
        }
      }
    } catch (e) {
      console.warn('[CODE DEATH] Could not create synthetic audio track:', e);
    }
  }

  return stream;
}

/**
 * Creates a high-definition Virtual IDE Screen Stream via Canvas.
 * Used when browser security policy restricts native getDisplayMedia inside an iframe,
 * or as a lightweight virtual screen presenter for pair programming.
 */
export function createVirtualScreenShareStream(options?: {
  filename?: string;
  codeSnippet?: string;
  username?: string;
}): MediaStream {
  const stream = new MediaStream();
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');

  const filename = options?.filename || 'App.jsx';
  const username = options?.username || 'Maheen';

  const defaultLines = [
    '// CODE DEATH Collaborative IDE - Live Code Screen Stream',
    'import React, { useState, useEffect, useCallback } from "react";',
    'import { CodeEditor, VideoPanel, LiveTerminal } from "./components";',
    '',
    'export default function CollaborativeWorkspace() {',
    '  const [activeSession, setActiveSession] = useState("CODE_DEATH_ALPHA");',
    '  const [collaborators, setCollaborators] = useState([',
    '    { name: "Maheen", role: "Host", status: "Presenting" },',
    '    { name: "Peer", role: "Developer", status: "Connected" },',
    '  ]);',
    '',
    '  // Synchronized state across distributed clients',
    '  const handleCodeChange = useCallback((newDelta) => {',
    '    socket.emit("code-sync", { delta: newDelta, timestamp: Date.now() });',
    '  }, []);',
    '',
    '  return (',
    '    <div className="workspace-container bg-[#0b0f19] text-white">',
    '      <CodeEditor activeFile="' + filename + '" onEdit={handleCodeChange} />',
    '      <LiveTerminal status="Connected to CODE DEATH Cloud" />',
    '    </div>',
    '  );',
    '}',
  ];

  const codeLines = options?.codeSnippet
    ? options.codeSnippet.split('\n').slice(0, 24)
    : defaultLines;

  let frame = 0;

  const drawScreen = () => {
    if (!ctx) return;
    frame++;

    // Background - Dark IDE canvas
    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Top Header Bar
    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, 0, canvas.width, 42);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 42);
    ctx.lineTo(canvas.width, 42);
    ctx.stroke();

    // Window controls
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(24, 21, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(44, 21, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(64, 21, 6, 0, Math.PI * 2);
    ctx.fill();

    // Window Title
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CODE DEATH - Virtual IDE Screen Presenter • ' + filename, canvas.width / 2, 25);

    // Live Broadcast Indicator (Right side of header)
    const isBlink = Math.floor(frame / 20) % 2 === 0;
    ctx.fillStyle = isBlink ? '#ef4444' : '#991b1b';
    ctx.beginPath();
    ctx.arc(canvas.width - 170, 21, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('LIVE STREAM', canvas.width - 158, 25);

    // File Tabs Bar
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 42, canvas.width, 36);
    ctx.beginPath();
    ctx.moveTo(0, 78);
    ctx.lineTo(canvas.width, 78);
    ctx.stroke();

    // Active File Tab
    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(16, 46, 160, 32);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, 46);
    ctx.lineTo(176, 46);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px system-ui, monospace';
    ctx.fillText('⚡ ' + filename, 30, 67);

    // Secondary Tab
    ctx.fillStyle = '#64748b';
    ctx.font = '12px system-ui, monospace';
    ctx.fillText('server.ts', 196, 67);

    // Left Gutter (Line Numbers)
    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, 78, 64, canvas.height - 78 - 32);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(64, 78);
    ctx.lineTo(64, canvas.height - 32);
    ctx.stroke();

    // Code lines rendering
    const startY = 108;
    const lineHeight = 23;

    ctx.font = '13px "JetBrains Mono", Consolas, monospace';

    codeLines.forEach((line, idx) => {
      const y = startY + idx * lineHeight;
      if (y > canvas.height - 40) return;

      // Line number
      ctx.textAlign = 'right';
      ctx.fillStyle = '#475569';
      ctx.fillText(String(idx + 1), 50, y);

      // Line text highlighting
      ctx.textAlign = 'left';
      if (line.trim().startsWith('//')) {
        ctx.fillStyle = '#64748b';
      } else if (line.includes('import') || line.includes('export') || line.includes('return') || line.includes('const') || line.includes('function')) {
        ctx.fillStyle = '#38bdf8'; // Cyan
      } else if (line.includes('"') || line.includes("'")) {
        ctx.fillStyle = '#34d399'; // Emerald string
      } else if (line.includes('<') || line.includes('/>')) {
        ctx.fillStyle = '#f43f5e'; // Rose JSX
      } else {
        ctx.fillStyle = '#e2e8f0'; // Slate text
      }

      ctx.fillText(line, 80, y);

      // Render blinking cursor at end of line 8
      if (idx === 8 && Math.floor(frame / 15) % 2 === 0) {
        const textWidth = ctx.measureText(line).width;
        ctx.fillStyle = '#00f2fe';
        ctx.fillRect(80 + textWidth + 3, y - 13, 8, 16);
      }
    });

    // Presenter watermark / status footer
    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, canvas.height - 32, canvas.width, 32);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - 32);
    ctx.lineTo(canvas.width, canvas.height - 32);
    ctx.stroke();

    // Left info
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('CODE DEATH IDE', 16, canvas.height - 12);

    ctx.fillStyle = '#64748b';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('• Presenter: ' + username + ' (You) • 1080p 30fps Virtual Stream', 130, canvas.height - 12);

    // Right info
    ctx.fillStyle = '#10b981';
    ctx.textAlign = 'right';
    ctx.fillText('● Stream Healthy', canvas.width - 20, canvas.height - 12);
  };

  drawScreen();
  const interval = setInterval(drawScreen, 1000 / 30);

  const canvasStream = canvas.captureStream ? canvas.captureStream(30) : (canvas as any).mozCaptureStream(30);
  const [videoTrack] = canvasStream.getVideoTracks();

  if (videoTrack) {
    videoTrack.addEventListener('ended', () => {
      clearInterval(interval);
    });
    stream.addTrack(videoTrack);
  }

  return stream;
}
