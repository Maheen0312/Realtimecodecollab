import { io, Socket } from 'socket.io-client';

export const initSocket = (): Socket => {
  const options = {
    forceNew: true,
    reconnectionAttempts: Infinity,
    timeout: 10000,
    transports: ['websocket', 'polling'],
  };
  return io(window.location.origin, options);
};
