import { io, Socket } from 'socket.io-client';

export const getSocketServerUrl = (): string => {
  const customUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_SOCKET_URL;
  if (customUrl) return customUrl.trim();
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
};

export const isVercelServerlessHost = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.endsWith('vercel.app');
};

export const initSocket = (): Socket => {
  const targetUrl = getSocketServerUrl();
  const isVercel = isVercelServerlessHost() && !import.meta.env.VITE_BACKEND_URL && !import.meta.env.VITE_SOCKET_URL;

  const options = {
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: isVercel ? 2 : 5, // Avoid infinite reconnection spam on serverless Vercel
    reconnectionDelay: 2000,
    reconnectionDelayMax: 5000,
    timeout: 6000,
    transports: isVercel ? ['polling'] : ['websocket', 'polling'],
  };

  return io(targetUrl, options);
};
