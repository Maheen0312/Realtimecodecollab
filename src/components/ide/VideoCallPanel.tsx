import React, { useState, useEffect, useRef, useCallback, FC } from 'react';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Monitor, 
  PhoneOff, 
  ShieldAlert, 
  Volume2, 
  VolumeX, 
  Radio, 
  ExternalLink, 
  Wifi, 
  Settings2, 
  AlertTriangle, 
  Headphones, 
  Camera, 
  RotateCcw,
  Loader2,
  Sparkles,
  Maximize2,
  Minimize2,
  X,
  Scaling,
  ChevronDown
} from 'lucide-react';
import { Client } from '../../types';
import toast from 'react-hot-toast';
import { createSimulatedMediaStream, createVirtualScreenShareStream } from '../../utils/virtualMedia';

export type CameraStatus = 'idle' | 'requesting' | 'initializing' | 'enabled' | 'disabled' | 'failed';

interface VideoCallPanelProps {
  currentUsername: string;
  clients: Client[];
  socket?: any;
  roomId?: string;
  onClose: () => void;
  onCallStateChange?: (isActive: boolean) => void;
}

interface PeerMediaInfo {
  socketId: string;
  username: string;
  userColor?: string;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  isScreenSharing: boolean;
  stream?: MediaStream;
}

export interface FullscreenParticipant {
  stream: MediaStream | null;
  username: string;
  userColor?: string;
  isLocal: boolean;
  isScreenSharing: boolean;
  isVideoLive: boolean;
  isMicLive: boolean;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export const VideoCallPanel: FC<VideoCallPanelProps> = ({
  currentUsername,
  clients,
  socket,
  roomId = 'default',
  onClose,
  onCallStateChange,
}) => {
  // Call States
  const [isInCall, setIsInCall] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [isMicOn, setIsMicOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isVirtualScreen, setIsVirtualScreen] = useState(false);
  const [showScreenShareHelp, setShowScreenShareHelp] = useState(false);
  const [showScreenShareMenu, setShowScreenShareMenu] = useState(false);
  const [screenShareErrorMsg, setScreenShareErrorMsg] = useState<string | null>(null);
  const [isAudioOnlyMode, setIsAudioOnlyMode] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [deviceWarning, setDeviceWarning] = useState<string | null>(null);

  // Available Devices
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);

  // Selected Device IDs
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string>('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>('');

  // Hardware Status
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const [microphoneUnavailable, setMicrophoneUnavailable] = useState(false);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [isSimulatedMedia, setIsSimulatedMedia] = useState(false);

  // Fullscreen Viewer State
  const [fullscreenPeer, setFullscreenPeer] = useState<FullscreenParticipant | null>(null);
  const [fullscreenFitMode, setFullscreenFitMode] = useState<'contain' | 'cover'>('contain');

  // Remote Peers
  const [remotePeers, setRemotePeers] = useState<Map<string, PeerMediaInfo>>(new Map());

  // Refs for WebRTC & Audio/Video Streams
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const savedCameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const isAcquiringMediaRef = useRef<boolean>(false);

  // ESC hotkey listener for Fullscreen Video Viewer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreenPeer) {
        setFullscreenPeer(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullscreenPeer]);

  // 1. Device Enumeration and Validation
  const enumerateAndValidateDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return { video: [], audioIn: [], audioOut: [] };
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const video = devices.filter((d) => d.kind === 'videoinput');
      const audioIn = devices.filter((d) => d.kind === 'audioinput');
      const audioOut = devices.filter((d) => d.kind === 'audiooutput');

      setVideoDevices(video);
      setAudioInputDevices(audioIn);
      setAudioOutputDevices(audioOut);

      setCameraUnavailable(video.length === 0);
      setMicrophoneUnavailable(audioIn.length === 0);

      // Validate selected camera ID exists in the fresh list
      setSelectedCameraId((prev) => {
        if (prev && video.some((d) => d.deviceId === prev)) return prev;
        return video[0]?.deviceId || '';
      });

      // Validate selected microphone ID exists in the fresh list
      setSelectedMicrophoneId((prev) => {
        if (prev && audioIn.some((d) => d.deviceId === prev)) return prev;
        return audioIn[0]?.deviceId || '';
      });

      // Validate selected speaker ID exists in the fresh list
      setSelectedSpeakerId((prev) => {
        if (prev && audioOut.some((d) => d.deviceId === prev)) return prev;
        return audioOut[0]?.deviceId || '';
      });

      return { video, audioIn, audioOut };
    } catch (err) {
      console.warn('[CODE DEATH Camera] Device enumeration warning:', err);
      return { video: [], audioIn: [], audioOut: [] };
    }
  }, []);

  // 2. Initial Device Check and DeviceChange Listener
  useEffect(() => {
    enumerateAndValidateDevices();

    if (!navigator.mediaDevices?.addEventListener) return;

    const handleDeviceChange = async () => {
      console.log('[CODE DEATH Camera] Media devicechange detected, refreshing device list...');
      const { video } = await enumerateAndValidateDevices();

      if (localStreamRef.current && isInCall) {
        const currentVideoTrack = localStreamRef.current.getVideoTracks()[0];
        if (currentVideoTrack) {
          const trackSettings = currentVideoTrack.getSettings();
          const currentId = trackSettings?.deviceId;
          const isStillPresent = !currentId || video.some((d) => d.deviceId === currentId);

          if (!isStillPresent) {
            toast('Active camera was disconnected.', { icon: '⚠️' });
            if (video.length > 0) {
              handleSwitchCamera(video[0].deviceId);
            } else {
              currentVideoTrack.stop();
              localStreamRef.current.removeTrack(currentVideoTrack);
              setCameraStatus('disabled');
              setIsAudioOnlyMode(true);
              setCameraUnavailable(true);
              socket?.emit('webrtc-media-state', {
                roomId,
                isVideoEnabled: false,
                isAudioEnabled: isMicOn,
                isScreenSharing: false,
              });
              toast('Switched to voice-only conference.', { icon: '🎙️' });
            }
          }
        }
      }
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [enumerateAndValidateDevices, isInCall, isMicOn, roomId, socket]);

  // Clean up all media and peer connections on unmount
  useEffect(() => {
    return () => {
      leaveCallInternal();
    };
  }, []);

  const leaveCallInternal = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    peerConnectionsRef.current.forEach((pc) => {
      try {
        pc.close();
      } catch (err) {
        console.warn('Error closing peer connection:', err);
      }
    });
    peerConnectionsRef.current.clear();
    setRemotePeers(new Map());

    if (socket) {
      socket.emit('webrtc-leave', { roomId });
    }
    setCameraStatus('idle');
    setIsSimulatedMedia(false);
  };

  // Callback ref for mounting local video element
  const attachLocalVideoRef = useCallback((node: HTMLVideoElement | null) => {
    localVideoRef.current = node;
    if (node && localStreamRef.current) {
      const stream = localStreamRef.current;
      if (node.srcObject !== stream) {
        console.log('[CODE DEATH Camera] Attaching stream to local video element on mount');
        node.srcObject = stream;
      }
      node.muted = true;
      node.playsInline = true;
      node.autoplay = true;
      node.play().then(() => {
        console.log('[CODE DEATH Camera] Local video playback started on mount', {
          videoWidth: node.videoWidth,
          videoHeight: node.videoHeight,
        });
      }).catch((err) => {
        console.warn('[CODE DEATH Camera] Local video play error on mount:', err);
      });
    }
  }, []);

  // Sync effect whenever isInCall, cameraStatus, or stream changes
  useEffect(() => {
    if (isInCall && localVideoRef.current && localStreamRef.current) {
      const node = localVideoRef.current;
      const stream = localStreamRef.current;
      if (node.srcObject !== stream) {
        console.log('[CODE DEATH Camera] Attaching stream in lifecycle effect');
        node.srcObject = stream;
      }
      node.muted = true;
      node.playsInline = true;
      node.autoplay = true;
      node.play().then(() => {
        console.log('[CODE DEATH Camera] Playback confirmed in effect', {
          videoWidth: node.videoWidth,
          videoHeight: node.videoHeight,
        });
      }).catch((err) => {
        console.warn('[CODE DEATH Camera] Effect play attempt warning:', err);
      });
    }
  }, [isInCall, cameraStatus, isScreenSharing]);

  // 3. WebRTC Signaling Listeners
  useEffect(() => {
    if (!socket || !isInCall) return;

    const handleExistingPeers = async ({ peers }: { peers: PeerMediaInfo[] }) => {
      console.log('[CODE DEATH WebRTC] Received existing peers:', peers.length);
      for (const peer of peers) {
        if (peer.socketId === socket.id) continue;
        await createPeerOffer(peer.socketId, peer.username, peer.userColor);
      }
    };

    const handleUserJoined = (peer: PeerMediaInfo) => {
      if (peer.socketId === socket.id) return;
      console.log('[CODE DEATH WebRTC] Remote peer joined:', peer.username, peer.socketId);
      setRemotePeers((prev) => {
        const next = new Map(prev);
        next.set(peer.socketId, {
          socketId: peer.socketId,
          username: peer.username,
          userColor: peer.userColor,
          isVideoEnabled: peer.isVideoEnabled,
          isAudioEnabled: peer.isAudioEnabled,
          isScreenSharing: peer.isScreenSharing,
        });
        return next;
      });
      toast(`${peer.username} joined the call`, { icon: '👋' });
    };

    const handleOffer = async ({ callerSocketId, callerUsername, sdp }: any) => {
      try {
        const pc = getOrCreatePeerConnection(callerSocketId, callerUsername);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('webrtc-answer', {
          targetSocketId: callerSocketId,
          sdp: answer,
        });
      } catch (err) {
        console.error('[CODE DEATH WebRTC] Failed to handle incoming offer:', err);
      }
    };

    const handleAnswer = async ({ answererSocketId, sdp }: any) => {
      try {
        const pc = peerConnectionsRef.current.get(answererSocketId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        }
      } catch (err) {
        console.error('[CODE DEATH WebRTC] Failed to handle answer:', err);
      }
    };

    const handleIceCandidate = async ({ senderSocketId, candidate }: any) => {
      try {
        const pc = peerConnectionsRef.current.get(senderSocketId);
        if (pc && candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.error('[CODE DEATH WebRTC] Failed to add ICE candidate:', err);
      }
    };

    const handleMediaState = ({ socketId, isVideoEnabled, isAudioEnabled, isScreenSharing }: any) => {
      setRemotePeers((prev) => {
        const next = new Map<string, PeerMediaInfo>(prev);
        const peer = next.get(socketId);
        if (peer) {
          next.set(socketId, {
            ...peer,
            isVideoEnabled,
            isAudioEnabled,
            isScreenSharing,
          });
        }
        return next;
      });
    };

    const handleUserLeft = ({ socketId }: { socketId: string }) => {
      const pc = peerConnectionsRef.current.get(socketId);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(socketId);
      }
      setRemotePeers((prev) => {
        const next = new Map<string, PeerMediaInfo>(prev);
        const peer = next.get(socketId);
        if (peer) {
          toast(`${peer.username} left the call`, { icon: '👋' });
        }
        next.delete(socketId);
        return next;
      });
    };

    socket.on('webrtc-existing-peers', handleExistingPeers);
    socket.on('webrtc-user-joined', handleUserJoined);
    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-ice-candidate', handleIceCandidate);
    socket.on('webrtc-media-state', handleMediaState);
    socket.on('webrtc-user-left', handleUserLeft);

    return () => {
      socket.off('webrtc-existing-peers', handleExistingPeers);
      socket.off('webrtc-user-joined', handleUserJoined);
      socket.off('webrtc-offer', handleOffer);
      socket.off('webrtc-answer', handleAnswer);
      socket.off('webrtc-ice-candidate', handleIceCandidate);
      socket.off('webrtc-media-state', handleMediaState);
      socket.off('webrtc-user-left', handleUserLeft);
    };
  }, [socket, isInCall, roomId]);

  const getOrCreatePeerConnection = (targetSocketId: string, username?: string, userColor?: string): RTCPeerConnection => {
    let pc = peerConnectionsRef.current.get(targetSocketId);
    if (pc && pc.connectionState !== 'closed' && pc.connectionState !== 'failed') {
      return pc;
    }

    pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current.set(targetSocketId, pc);

    // Add all current local tracks to the connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        console.log('[CODE DEATH WebRTC] Adding local track to peer connection:', track.kind, track.id);
        pc!.addTrack(track, localStreamRef.current!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('webrtc-ice-candidate', {
          targetSocketId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      console.log('[CODE DEATH WebRTC] Received remote track from peer:', targetSocketId, event.track.kind);
      if (remoteStream) {
        setRemotePeers((prev) => {
          const next = new Map<string, PeerMediaInfo>(prev);
          const existing = next.get(targetSocketId);
          next.set(targetSocketId, {
            socketId: targetSocketId,
            username: existing?.username || username || 'Peer',
            userColor: existing?.userColor || userColor || '#38bdf8',
            isVideoEnabled: existing?.isVideoEnabled ?? true,
            isAudioEnabled: existing?.isAudioEnabled ?? true,
            isScreenSharing: existing?.isScreenSharing ?? false,
            stream: remoteStream,
          });
          return next;
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[CODE DEATH WebRTC] Peer connection state:', targetSocketId, pc?.connectionState);
      if (pc?.connectionState === 'disconnected' || pc?.connectionState === 'closed') {
        peerConnectionsRef.current.delete(targetSocketId);
      }
    };

    return pc;
  };

  const createPeerOffer = async (targetSocketId: string, username?: string, userColor?: string) => {
    if (!localStreamRef.current || !socket) return;
    try {
      const pc = getOrCreatePeerConnection(targetSocketId, username, userColor);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('webrtc-offer', {
        targetSocketId,
        callerUsername: currentUsername,
        sdp: offer,
      });
    } catch (err) {
      console.error('[CODE DEATH WebRTC] Failed to create offer for peer:', err);
    }
  };

  // 4. Robust Media Acquisition Waterfall
  const handleJoinCall = async (forceAudioOnly = false) => {
    if (isAcquiringMediaRef.current) {
      console.log('[CODE DEATH Camera] Media acquisition already in progress, skipping duplicate call.');
      return;
    }
    isAcquiringMediaRef.current = true;
    setPermissionError(null);
    setDeviceWarning(null);

    console.log('[CODE DEATH Camera] Camera initialization started', { forceAudioOnly });

    try {
      // Refresh current device inventory
      const { video, audioIn } = await enumerateAndValidateDevices();
      console.log('[CODE DEATH Camera] Available video devices:', video.length, 'Audio devices:', audioIn.length);

      if (audioIn.length === 0 && video.length === 0) {
        setPermissionError('No camera or microphone devices detected on this computer.');
        setCameraStatus('failed');
        toast.error('No input media devices detected');
        return;
      }

      const wantVideo = !forceAudioOnly && video.length > 0;
      if (wantVideo) {
        setCameraStatus('requesting');
      } else {
        setCameraStatus('disabled');
        setIsAudioOnlyMode(true);
      }

      let stream: MediaStream | null = null;
      let usingSimulated = false;

      // STEP A: Try requesting video + audio with selected or default devices
      if (wantVideo) {
        setCameraStatus('initializing');
        const isSelectedValid = selectedCameraId && video.some((d) => d.deviceId === selectedCameraId);
        const activeCamId = isSelectedValid ? selectedCameraId : '';
        console.log('[CODE DEATH Camera] Selected camera ID:', activeCamId || '(default)');

        const videoConstraint: MediaTrackConstraints | boolean = activeCamId
          ? { deviceId: { exact: activeCamId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } };

        const isAudioValid = selectedMicrophoneId && audioIn.some((d) => d.deviceId === selectedMicrophoneId);
        const audioConstraint: MediaTrackConstraints | boolean = isAudioValid
          ? { deviceId: { exact: selectedMicrophoneId } }
          : true;

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraint,
            audio: audioConstraint,
          });
          console.log('[CODE DEATH Camera] MediaStream created with constraints:', stream.id);
        } catch (firstErr: any) {
          console.warn('[CODE DEATH Camera] Initial constraint request failed; retrying standard stream...', firstErr);

          // If NotFoundError occurred, immediately clear specific IDs
          setSelectedCameraId('');
          setSelectedMicrophoneId('');

          // STEP B: Retry with generic unconstrained video and audio
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true,
            });
            console.log('[CODE DEATH Camera] Standard video+audio stream created successfully:', stream.id);
          } catch (standardErr: any) {
            console.warn('[CODE DEATH Camera] Standard video+audio failed; trying video-only then audio-only...', standardErr);

            // Try video-only with no audio constraint (in case mic was the device causing NotFoundError)
            try {
              const videoOnlyStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false,
              });
              stream = videoOnlyStream;
              console.log('[CODE DEATH Camera] Video-only stream created successfully:', stream.id);
            } catch (videoOnlyErr: any) {
              console.warn('[CODE DEATH Camera] Video-only failed; falling back to audio...', videoOnlyErr);
            }
          }
        }
      }

      // STEP C: Audio-only fallback if video failed or wasn't requested
      if (!stream) {
        try {
          const audioConstraint: MediaTrackConstraints | boolean = selectedMicrophoneId
            ? { deviceId: { exact: selectedMicrophoneId } }
            : true;

          stream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: audioConstraint,
          });
          setIsAudioOnlyMode(true);
          setCameraStatus('disabled');
          if (wantVideo) {
            setCameraUnavailable(true);
            setDeviceWarning('Physical camera unavailable. Joined call in voice-only mode.');
            toast('Physical camera unavailable. Voice-only call activated.', { icon: '🎙️' });
          }
        } catch (audioErr: any) {
          // Retry standard audio with zero constraints
          setSelectedMicrophoneId('');
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: false,
              audio: true,
            });
            setIsAudioOnlyMode(true);
            setCameraStatus('disabled');
            if (wantVideo) {
              setCameraUnavailable(true);
              setDeviceWarning('Physical camera unavailable. Joined call in voice-only mode.');
              toast('Voice-only mode activated.', { icon: '🎙️' });
            }
          } catch (finalAudioErr: any) {
            // STEP D: If all hardware failed with NotFoundError, provide simulated virtual media stream
            const errName = finalAudioErr?.name || audioErr?.name;
            console.warn('[CODE DEATH Camera] Hardware media acquisition failed:', errName, finalAudioErr);

            if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError' || errName === 'OverconstrainedError') {
              console.log('[CODE DEATH Camera] Falling back to simulated media stream for testing/virtual environment');
              try {
                const simStream = createSimulatedMediaStream({
                  video: wantVideo,
                  audio: true,
                  username: currentUsername,
                });
                stream = simStream;
                usingSimulated = true;
                setIsSimulatedMedia(true);
                setDeviceWarning('No physical webcam/mic found. Activated simulated camera feed.');
                toast('Simulated camera feed active', { icon: '✨' });
              } catch (simErr) {
                console.error('[CODE DEATH Camera] Failed to create simulated stream:', simErr);
              }
            }

            if (!stream) {
              setCameraStatus('failed');
              if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
                setPermissionError('Camera or microphone permission was blocked. Please allow device permissions in your browser address bar.');
                toast.error('Permission denied for media devices');
              } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
                setPermissionError('No working camera or microphone found on this device.');
                toast.error('Device not found');
              } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
                setPermissionError('Camera or microphone is already in use by another application.');
                toast.error('Device is in use');
              } else if (errName === 'OverconstrainedError') {
                setPermissionError('Selected camera resolution or device is not supported by your hardware.');
                toast.error('Unsupported device constraints');
              } else {
                setPermissionError(`Media device error: ${finalAudioErr?.message || 'Access failed'}`);
                toast.error('Failed to acquire media devices');
              }
              return;
            }
          }
        }
      }

      // Verify video tracks if video was requested
      if (stream) {
        const videoTracks = stream.getVideoTracks();
        console.log('[CODE DEATH Camera] Video track count:', videoTracks.length);
        if (videoTracks.length > 0) {
          const track = videoTracks[0];
          console.log('[CODE DEATH Camera] Video track readyState:', track.readyState, 'enabled:', track.enabled);
          if (track.readyState === 'live' && track.enabled) {
            setCameraStatus('enabled');
            setIsAudioOnlyMode(false);
          } else {
            setCameraStatus('failed');
          }
        } else if (wantVideo && !usingSimulated) {
          setCameraStatus('disabled');
        }
      }

      // Stop any prior tracks before applying new stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      localStreamRef.current = stream;

      // Attach stream to local video element if already mounted
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.playsInline = true;
        localVideoRef.current.autoplay = true;
        localVideoRef.current.play().catch((playErr) => {
          console.warn('[CODE DEATH Camera] Initial play attempt warning:', playErr);
        });
        console.log('[CODE DEATH Camera] Video element attached successfully');
      }

      setIsInCall(true);
      setIsMicOn(true);
      onCallStateChange?.(true);

      // Re-enumerate to get human-readable device labels now that permission is granted
      await enumerateAndValidateDevices();

      const isVideoLive = stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].readyState === 'live' && stream.getVideoTracks()[0].enabled;

      if (socket) {
        socket.emit('webrtc-join', {
          roomId,
          username: currentUsername,
          isVideoEnabled: isVideoLive,
          isAudioEnabled: true,
        });
      }

      toast.success(isVideoLive ? 'Joined video & audio conference' : 'Joined voice conference');
    } finally {
      isAcquiringMediaRef.current = false;
    }
  };

  const handleLeaveCall = () => {
    leaveCallInternal();
    setIsInCall(false);
    setIsScreenSharing(false);
    setIsAudioOnlyMode(false);
    setDeviceWarning(null);
    onCallStateChange?.(false);
    toast('Left the conference', { icon: '👋' });
  };

  // 5. Live Device Switching Controls
  const handleSwitchCamera = async (newDeviceId: string) => {
    if (!newDeviceId) return;
    setSelectedCameraId(newDeviceId);
    if (!isInCall || !localStreamRef.current || isAudioOnlyMode) return;

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: newDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];

      if (oldVideoTrack) {
        localStreamRef.current.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
      }
      localStreamRef.current.addTrack(newVideoTrack);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
        localVideoRef.current.play().catch(() => {});
      }

      // Replace track across all RTCPeerConnections
      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(newVideoTrack);
        } else {
          pc.addTrack(newVideoTrack, localStreamRef.current!);
        }
      });

      setCameraStatus('enabled');
      toast.success('Camera switched');
    } catch (err) {
      console.warn('[CODE DEATH Camera] Failed to switch camera:', err);
      toast.error('Could not switch to selected camera');
    }
  };

  const handleSwitchMicrophone = async (newDeviceId: string) => {
    if (!newDeviceId) return;
    setSelectedMicrophoneId(newDeviceId);
    if (!isInCall || !localStreamRef.current) return;

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: newDeviceId } },
        video: false,
      });
      const newAudioTrack = newStream.getAudioTracks()[0];
      const oldAudioTrack = localStreamRef.current.getAudioTracks()[0];

      if (oldAudioTrack) {
        localStreamRef.current.removeTrack(oldAudioTrack);
        oldAudioTrack.stop();
      }
      localStreamRef.current.addTrack(newAudioTrack);

      // Replace audio track across all RTCPeerConnections
      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
        if (sender) {
          sender.replaceTrack(newAudioTrack);
        } else {
          pc.addTrack(newAudioTrack, localStreamRef.current!);
        }
      });

      setIsMicOn(true);
      toast.success('Microphone switched');
    } catch (err) {
      console.warn('Failed to switch microphone:', err);
      toast.error('Could not switch to selected microphone');
    }
  };

  const handleSwitchSpeaker = async (newDeviceId: string) => {
    setSelectedSpeakerId(newDeviceId);
    if (!newDeviceId) return;

    remoteVideosRef.current.forEach(async (el) => {
      if ('setSinkId' in el) {
        try {
          await (el as any).setSinkId(newDeviceId);
        } catch (err) {
          console.warn('Failed to set audio sink:', err);
        }
      }
    });
    toast.success('Audio output device updated');
  };

  // 6. Camera / Mic / ScreenShare Toggles
  const toggleCamera = async () => {
    if (!localStreamRef.current) return;
    const currentTrack = localStreamRef.current.getVideoTracks()[0];

    if (cameraStatus === 'enabled') {
      // Turn Camera OFF
      console.log('[CODE DEATH Camera] Toggling camera OFF');
      if (currentTrack) {
        currentTrack.enabled = false;
      }
      setCameraStatus('disabled');
      socket?.emit('webrtc-media-state', {
        roomId,
        isVideoEnabled: false,
        isAudioEnabled: isMicOn,
        isScreenSharing,
      });
      toast('Camera turned off', { icon: '📷' });
    } else {
      // Turn Camera ON
      console.log('[CODE DEATH Camera] Toggling camera ON');
      setCameraStatus('initializing');

      // Check if existing live track can be re-enabled
      if (currentTrack && currentTrack.readyState === 'live') {
        currentTrack.enabled = true;
        setCameraStatus('enabled');
        if (localVideoRef.current) {
          localVideoRef.current.play().catch(() => {});
        }
        socket?.emit('webrtc-media-state', {
          roomId,
          isVideoEnabled: true,
          isAudioEnabled: isMicOn,
          isScreenSharing,
        });
        toast.success('Camera enabled');
      } else {
        // Track ended or missing: request fresh camera stream
        try {
          setCameraStatus('requesting');
          const { video } = await enumerateAndValidateDevices();

          let freshTrack: MediaStreamTrack | null = null;

          if (video.length > 0) {
            const validDeviceId = video.some((d) => d.deviceId === selectedCameraId) ? selectedCameraId : '';
            const videoConstraints: MediaStreamConstraints['video'] = validDeviceId
              ? { deviceId: { exact: validDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
              : { width: { ideal: 1280 }, height: { ideal: 720 } };

            try {
              const freshVideoStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
              freshTrack = freshVideoStream.getVideoTracks()[0];
            } catch (initialCamErr: any) {
              console.warn('[CODE DEATH Camera] Toggle camera initial constraint failed, retrying generic video...', initialCamErr);
              setSelectedCameraId('');
              try {
                const retryStream = await navigator.mediaDevices.getUserMedia({ video: true });
                freshTrack = retryStream.getVideoTracks()[0];
              } catch (retryCamErr: any) {
                console.warn('[CODE DEATH Camera] Generic camera retry failed:', retryCamErr);
              }
            }
          }

          // If no physical camera exists or all physical attempts threw NotFoundError, fallback to simulated stream
          if (!freshTrack) {
            console.log('[CODE DEATH Camera] Creating simulated video track for camera toggle');
            const simStream = createSimulatedMediaStream({
              video: true,
              audio: false,
              username: currentUsername,
            });
            freshTrack = simStream.getVideoTracks()[0];
            setIsSimulatedMedia(true);
            toast('Simulated camera feed active', { icon: '✨' });
          }

          const newTrack = freshTrack;

          if (newTrack && newTrack.readyState === 'live') {
            if (currentTrack) {
              localStreamRef.current.removeTrack(currentTrack);
              currentTrack.stop();
            }
            localStreamRef.current.addTrack(newTrack);
            setIsAudioOnlyMode(false);
            setCameraUnavailable(false);
            setCameraStatus('enabled');

            if (localVideoRef.current) {
              localVideoRef.current.srcObject = localStreamRef.current;
              localVideoRef.current.play().catch(() => {});
            }

            // Update WebRTC peer senders
            peerConnectionsRef.current.forEach((pc) => {
              const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
              if (sender) {
                sender.replaceTrack(newTrack);
              } else {
                pc.addTrack(newTrack, localStreamRef.current!);
              }
            });

            socket?.emit('webrtc-media-state', {
              roomId,
              isVideoEnabled: true,
              isAudioEnabled: isMicOn,
              isScreenSharing,
            });
            toast.success('Camera activated');
          } else {
            setCameraStatus('failed');
            toast.error('Failed to start camera track');
          }
        } catch (err: any) {
          setCameraStatus('failed');
          console.error('[CODE DEATH Camera] Toggle camera acquisition error:', err);
          const errName = err?.name;
          if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
            toast.error('Camera permission denied in browser');
          } else if (errName === 'NotFoundError') {
            toast.error('Camera device not found');
          } else if (errName === 'NotReadableError') {
            toast.error('Camera is in use by another app');
          } else {
            toast.error('Could not activate camera');
          }
        }
      }
    }
  };

  const toggleMicrophone = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
        socket?.emit('webrtc-media-state', {
          roomId,
          isVideoEnabled: cameraStatus === 'enabled' && !isAudioOnlyMode,
          isAudioEnabled: audioTrack.enabled,
          isScreenSharing,
        });
      }
    }
  };

  const stopScreenShare = useCallback(async () => {
    setIsScreenSharing(false);
    setIsVirtualScreen(false);

    if (!localStreamRef.current) {
      return;
    }

    console.log('[CODE DEATH WebRTC] Stopping screen share and restoring camera...');
    
    // 1. Remove and stop the screen track
    const screenTrack = localStreamRef.current.getVideoTracks()[0];
    if (screenTrack) {
      localStreamRef.current.removeTrack(screenTrack);
      screenTrack.stop();
    }

    // 2. Restore preserved camera track if still live
    let restoredVideoTrack = savedCameraTrackRef.current;
    if (restoredVideoTrack && restoredVideoTrack.readyState === 'live') {
      restoredVideoTrack.enabled = true;
      localStreamRef.current.addTrack(restoredVideoTrack);
      setCameraStatus('enabled');
    } else {
      // If camera wasn't on before or was lost, check if we can re-acquire or keep disabled
      try {
        const { video } = await enumerateAndValidateDevices();
        if (video.length > 0 && selectedCameraId) {
          const freshCamStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: selectedCameraId }, width: { ideal: 1280 }, height: { ideal: 720 } },
          });
          restoredVideoTrack = freshCamStream.getVideoTracks()[0];
          localStreamRef.current.addTrack(restoredVideoTrack);
          setCameraStatus('enabled');
        } else {
          setCameraStatus('disabled');
        }
      } catch {
        setCameraStatus('disabled');
      }
    }

    savedCameraTrackRef.current = null;

    // 3. Update local video preview
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play().catch(() => {});
    }

    // 4. Replace video track across all peer connections
    peerConnectionsRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        if (restoredVideoTrack && restoredVideoTrack.readyState === 'live') {
          sender.replaceTrack(restoredVideoTrack);
        } else {
          sender.replaceTrack(null);
        }
      }
    });

    // 5. Broadcast updated media state
    socket?.emit('webrtc-media-state', {
      roomId,
      isVideoEnabled: restoredVideoTrack?.enabled ?? false,
      isAudioEnabled: isMicOn,
      isScreenSharing: false,
    });

    toast('Screen sharing ended', { icon: '🖥️' });
  }, [enumerateAndValidateDevices, isMicOn, roomId, selectedCameraId, socket]);

  const startVirtualScreenShare = useCallback(() => {
    if (!isInCall || !localStreamRef.current) {
      toast.error('You must join the call to present your screen');
      return;
    }
    try {
      console.log('[CODE DEATH WebRTC] Starting Virtual IDE Screen Presenter...');
      
      // Preserve current webcam track without stopping it
      const currentCamTrack = localStreamRef.current.getVideoTracks()[0];
      if (currentCamTrack) {
        savedCameraTrackRef.current = currentCamTrack;
        localStreamRef.current.removeTrack(currentCamTrack);
      }

      const virtualStream = createVirtualScreenShareStream({
        username: currentUsername,
      });

      const screenTrack = virtualStream.getVideoTracks()[0];
      if (!screenTrack) {
        throw new Error('Failed to generate virtual screen track');
      }

      localStreamRef.current.addTrack(screenTrack);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = virtualStream;
        localVideoRef.current.play().catch(() => {});
      }

      setIsScreenSharing(true);
      setIsVirtualScreen(true);
      setShowScreenShareHelp(false);
      setShowScreenShareMenu(false);

      // Replace track across all peer connections
      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, localStreamRef.current!);
        }
      });

      screenTrack.onended = () => {
        stopScreenShare();
      };

      socket?.emit('webrtc-media-state', {
        roomId,
        isVideoEnabled: true,
        isAudioEnabled: isMicOn,
        isScreenSharing: true,
      });

      toast.success('Live Virtual IDE Screen Presenter started', { icon: '🖥️' });
    } catch (err: any) {
      console.error('[CODE DEATH WebRTC] Failed to start virtual screen presenter:', err);
      toast.error('Failed to start virtual screen presenter');
    }
  }, [currentUsername, isInCall, isMicOn, roomId, socket, stopScreenShare]);

  const toggleScreenShare = async () => {
    if (!isInCall || !localStreamRef.current) return;

    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }

    try {
      console.log('[CODE DEATH WebRTC] Requesting getDisplayMedia for screen sharing...');
      
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('Screen sharing (getDisplayMedia) is not supported in this browser.');
      }

      // Preserve current webcam track without stopping it
      const currentCamTrack = localStreamRef.current.getVideoTracks()[0];
      if (currentCamTrack) {
        savedCameraTrackRef.current = currentCamTrack;
        localStreamRef.current.removeTrack(currentCamTrack);
      }

      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor',
        } as any,
        audio: false,
      });

      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) {
        throw new Error('No screen video track returned by getDisplayMedia');
      }

      localStreamRef.current.addTrack(screenTrack);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream;
        localVideoRef.current.play().catch(() => {});
      }

      setIsScreenSharing(true);
      setIsVirtualScreen(false);
      setShowScreenShareHelp(false);
      setShowScreenShareMenu(false);

      // Replace track across all peer connections
      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, localStreamRef.current!);
        }
      });

      // Listen to native browser "Stop Sharing" button in Chrome/Firefox/Safari
      screenTrack.onended = () => {
        console.log('[CODE DEATH WebRTC] Browser native stop sharing triggered');
        stopScreenShare();
      };

      socket?.emit('webrtc-media-state', {
        roomId,
        isVideoEnabled: true,
        isAudioEnabled: isMicOn,
        isScreenSharing: true,
      });

      toast.success('Screen sharing started');
    } catch (err: any) {
      console.warn('[CODE DEATH WebRTC] Screen share request failed or cancelled:', err);
      // Restore camera track if screen share was cancelled or failed
      if (savedCameraTrackRef.current && localStreamRef.current) {
        localStreamRef.current.addTrack(savedCameraTrackRef.current);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
          localVideoRef.current.play().catch(() => {});
        }
        savedCameraTrackRef.current = null;
      }
      setIsScreenSharing(false);
      setIsVirtualScreen(false);

      const errMsg = String(err?.message || '');
      const errName = err?.name;
      const isPermissionsPolicyBlocked = 
        errMsg.toLowerCase().includes('permissions policy') || 
        errMsg.toLowerCase().includes('display-capture') ||
        errMsg.toLowerCase().includes('disallowed');

      if (isPermissionsPolicyBlocked) {
        setScreenShareErrorMsg(
          'Display capture is disallowed inside the preview iframe by browser security policies.'
        );
        setShowScreenShareHelp(true);
        toast.error('Screen sharing restricted in iframe preview', { duration: 4000 });
      } else if (errName === 'NotAllowedError') {
        toast('Screen sharing cancelled', { icon: 'ℹ️' });
      } else {
        toast.error('Screen sharing failed: ' + (errMsg || 'Not supported'));
      }
    }
  };

  const remotePeerList: PeerMediaInfo[] = Array.from(remotePeers.values());

  return (
    <div className="flex flex-col h-full bg-slate-900/95 text-slate-300 border-r border-slate-800 text-xs select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        <span className="flex items-center gap-1.5 text-cyan-400">
          <Video className="w-3.5 h-3.5" /> VOICE & VIDEO CALL
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowDeviceSettings(!showDeviceSettings)}
            title="Audio & Video Device Settings"
            className={`p-1 rounded-md transition-colors cursor-pointer ${
              showDeviceSettings ? 'bg-cyan-500/20 text-cyan-400' : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono flex items-center gap-1 ${
            isInCall ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
          }`}>
            {isInCall ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE ({remotePeerList.length + 1})
              </>
            ) : (
              'IDLE'
            )}
          </span>
        </div>
      </div>

      {/* Device Settings Drawer */}
      {showDeviceSettings && (
        <div className="p-3 bg-slate-950/80 border-b border-slate-800 space-y-2.5 animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
            <span className="flex items-center gap-1 text-cyan-400">
              <Settings2 className="w-3 h-3" /> Device Configuration
            </span>
            <button
              onClick={enumerateAndValidateDevices}
              title="Refresh Devices"
              className="text-[10px] text-slate-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" /> Refresh
            </button>
          </div>

          {/* Camera Select */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
              <Camera className="w-3 h-3 text-cyan-400" /> Camera
            </label>
            <select
              value={selectedCameraId}
              onChange={(e) => handleSwitchCamera(e.target.value)}
              disabled={videoDevices.length === 0}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-cyan-500 disabled:opacity-50 cursor-pointer"
            >
              {videoDevices.length === 0 ? (
                <option value="">No camera detected</option>
              ) : (
                videoDevices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Camera ${i + 1}`}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Microphone Select */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
              <Mic className="w-3 h-3 text-emerald-400" /> Microphone
            </label>
            <select
              value={selectedMicrophoneId}
              onChange={(e) => handleSwitchMicrophone(e.target.value)}
              disabled={audioInputDevices.length === 0}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50 cursor-pointer"
            >
              {audioInputDevices.length === 0 ? (
                <option value="">No microphone detected</option>
              ) : (
                audioInputDevices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Microphone ${i + 1}`}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Speaker Select */}
          {audioOutputDevices.length > 0 && (
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                <Headphones className="w-3 h-3 text-indigo-400" /> Audio Output
              </label>
              <select
                value={selectedSpeakerId}
                onChange={(e) => handleSwitchSpeaker(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {audioOutputDevices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Speaker ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Main Call Body */}
      <div className="flex-1 p-3 flex flex-col justify-between overflow-y-auto min-h-0">
        {!isInCall ? (
          <div className="my-auto text-center space-y-4 py-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/5">
              <Video className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <h3 className="font-bold text-slate-200 text-sm">Real-Time WebRTC Conferencing</h3>
              <p className="text-slate-400 text-[11px] max-w-[220px] mx-auto leading-relaxed">
                Connect face-to-face or voice-only with room peers while simultaneously coding and running terminals.
              </p>
            </div>

            {/* Hardware Status Indicators */}
            <div className="flex items-center justify-center gap-2 pt-1">
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                videoDevices.length > 0
                  ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                <Camera className="w-3 h-3" />
                {videoDevices.length > 0 ? `${videoDevices.length} Cam` : 'No Cam'}
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                audioInputDevices.length > 0
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                <Mic className="w-3 h-3" />
                {audioInputDevices.length > 0 ? `${audioInputDevices.length} Mic` : 'No Mic'}
              </span>
            </div>

            {permissionError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] flex flex-col gap-1.5 text-left">
                <div className="flex items-center gap-1.5 font-semibold text-rose-400">
                  <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                  <span>Media Access Restricted</span>
                </div>
                <p className="text-slate-400">{permissionError}</p>
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 underline font-medium"
                >
                  <ExternalLink className="w-3 h-3" /> Open in dedicated window
                </a>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <button
                onClick={() => handleJoinCall(false)}
                disabled={cameraUnavailable && microphoneUnavailable}
                className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Video className="w-4 h-4" /> Start Video & Audio Call
              </button>

              <button
                onClick={() => handleJoinCall(true)}
                disabled={microphoneUnavailable && videoDevices.length === 0}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl border border-slate-700/80 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <Mic className="w-4 h-4 text-emerald-400" /> Join Voice Only
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 flex-1 flex flex-col min-h-0">
            {/* Warning banner if camera fell back to audio */}
            {deviceWarning && (
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <span>{deviceWarning}</span>
              </div>
            )}

            {/* Local Video Stream Tile (Always visible independently of remote peers) */}
            <div 
              className={`relative aspect-video w-full bg-slate-950 rounded-xl overflow-hidden border shadow-lg min-h-[160px] flex-shrink-0 group cursor-pointer transition-all ${
                isScreenSharing ? 'border-cyan-500/50 shadow-cyan-500/10' : 'border-slate-800'
              }`}
              onClick={() => {
                if (localStreamRef.current && (cameraStatus === 'enabled' || isScreenSharing)) {
                  setFullscreenPeer({
                    stream: localStreamRef.current,
                    username: `${currentUsername} (You)`,
                    userColor: '#38bdf8',
                    isLocal: true,
                    isScreenSharing,
                    isVideoLive: cameraStatus === 'enabled' || isScreenSharing,
                    isMicLive: isMicOn,
                  });
                  setFullscreenFitMode(isScreenSharing ? 'contain' : 'cover');
                }
              }}
            >
              <video
                ref={attachLocalVideoRef}
                autoPlay
                muted
                playsInline
                onLoadedMetadata={(e) => {
                  const target = e.currentTarget;
                  console.log('[CODE DEATH Camera] Video element onLoadedMetadata triggered:', {
                    videoWidth: target.videoWidth,
                    videoHeight: target.videoHeight,
                  });
                  target.play().catch(() => {});
                }}
                className={`w-full h-full block ${isScreenSharing ? 'object-contain bg-slate-950' : 'object-cover scale-x-[-1]'}`}
              />

              {/* Overlay if camera is off / initializing / failed / audio-only */}
              {(cameraStatus !== 'enabled' || isAudioOnlyMode) && !isScreenSharing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-slate-400 p-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400 font-bold mb-2 shadow-inner">
                    {cameraStatus === 'initializing' || cameraStatus === 'requesting' ? (
                      <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                    ) : (
                      <span className="text-base">{currentUsername[0]?.toUpperCase() || 'U'}</span>
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-slate-300">
                    {cameraStatus === 'requesting'
                      ? 'Requesting Camera...'
                      : cameraStatus === 'initializing'
                      ? 'Starting Camera Stream...'
                      : cameraStatus === 'failed'
                      ? 'Camera Unavailable'
                      : isAudioOnlyMode
                      ? 'Voice-Only Mode'
                      : 'Camera Off'}
                  </span>
                  {cameraStatus === 'failed' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCamera();
                      }}
                      className="mt-2 px-2.5 py-1 text-[10px] bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 rounded-md border border-cyan-500/40 cursor-pointer"
                    >
                      Retry Camera
                    </button>
                  )}
                </div>
              )}

              {/* Expand to Fullscreen hover button */}
              {(cameraStatus === 'enabled' || isScreenSharing) && (
                <button
                  type="button"
                  title="Expand Video (Fullscreen)"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (localStreamRef.current) {
                      setFullscreenPeer({
                        stream: localStreamRef.current,
                        username: `${currentUsername} (You)`,
                        userColor: '#38bdf8',
                        isLocal: true,
                        isScreenSharing,
                        isVideoLive: cameraStatus === 'enabled' || isScreenSharing,
                        isMicLive: isMicOn,
                      });
                      setFullscreenFitMode(isScreenSharing ? 'contain' : 'cover');
                    }
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 hover:bg-cyan-500 text-slate-200 hover:text-slate-950 opacity-0 group-hover:opacity-100 transition-all backdrop-blur-xs z-20 cursor-pointer shadow-md border border-white/10"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Local User Badge */}
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-xs text-[10px] text-white flex items-center gap-1.5 font-medium border border-white/10 z-10">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="truncate max-w-[110px]">{currentUsername} (You)</span>
                {isScreenSharing && (
                  <span className={`text-[9px] px-1 py-0.2 rounded border flex items-center gap-0.5 font-bold ${
                    isVirtualScreen 
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' 
                      : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                  }`}>
                    {isVirtualScreen ? <Sparkles className="w-2.5 h-2.5" /> : <Monitor className="w-2.5 h-2.5" />}
                    {isVirtualScreen ? 'Virtual Screen' : 'Sharing'}
                  </span>
                )}
                {isSimulatedMedia && !isScreenSharing && (
                  <span className="text-[9px] bg-cyan-500/20 text-cyan-300 px-1 py-0.2 rounded border border-cyan-500/30 flex items-center gap-0.5">
                    <Sparkles className="w-2.5 h-2.5" /> Virtual
                  </span>
                )}
                {!isMicOn ? (
                  <MicOff className="w-3 h-3 text-rose-400 ml-1" />
                ) : (
                  <Volume2 className="w-3 h-3 text-emerald-400 ml-1" />
                )}
              </div>
            </div>

            {/* Remote Participants Grid (Positioned below local video, does NOT hide local video) */}
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-2">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center justify-between pt-1">
                <span>PEERS IN CALL ({remotePeerList.length})</span>
                {remotePeerList.length > 0 && (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Wifi className="w-3 h-3" /> P2P Connected
                  </span>
                )}
              </div>

              {remotePeerList.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-center text-slate-500 text-[11px] my-auto">
                  <Radio className="w-6 h-6 mx-auto mb-1.5 opacity-40 text-cyan-400 animate-pulse" />
                  <p className="text-slate-300 font-medium">Waiting for room peers</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Peers who join this call will appear here automatically with their live stream.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {remotePeerList.map((peer) => (
                    <RemotePeerTile
                      key={peer.socketId}
                      peer={peer}
                      selectedSpeakerId={selectedSpeakerId}
                      registerVideoEl={(el) => {
                        if (el) remoteVideosRef.current.set(peer.socketId, el);
                        else remoteVideosRef.current.delete(peer.socketId);
                      }}
                      onExpand={() => {
                        setFullscreenPeer({
                          stream: peer.stream || null,
                          username: peer.username,
                          userColor: peer.userColor,
                          isLocal: false,
                          isScreenSharing: peer.isScreenSharing,
                          isVideoLive: peer.isVideoEnabled,
                          isMicLive: peer.isAudioEnabled,
                        });
                        setFullscreenFitMode(peer.isScreenSharing ? 'contain' : 'cover');
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom Call Controls */}
        {isInCall && (
          <div className="pt-3 border-t border-slate-800 flex items-center justify-center space-x-2 flex-shrink-0">
            {/* Microphone Toggle Button */}
            <button
              title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
              onClick={toggleMicrophone}
              className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                isMicOn 
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' 
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-sm'
              }`}
            >
              {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 text-rose-400" />}
            </button>

            {/* Camera Toggle Button (Reflecting real hardware state) */}
            <button
              title={
                cameraStatus === 'enabled'
                  ? 'Turn Camera Off'
                  : cameraStatus === 'initializing' || cameraStatus === 'requesting'
                  ? 'Initializing Camera...'
                  : cameraStatus === 'failed'
                  ? 'Camera Unavailable - Click to Retry'
                  : 'Turn Camera On'
              }
              onClick={toggleCamera}
              disabled={cameraStatus === 'initializing' || cameraStatus === 'requesting'}
              className={`p-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center ${
                cameraStatus === 'enabled'
                  ? 'bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 shadow-sm'
                  : cameraStatus === 'initializing' || cameraStatus === 'requesting'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                  : cameraStatus === 'failed'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
              }`}
            >
              {cameraStatus === 'initializing' || cameraStatus === 'requesting' ? (
                <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
              ) : cameraStatus === 'enabled' ? (
                <Video className="w-4 h-4 text-cyan-400" />
              ) : (
                <VideoOff className="w-4 h-4 text-rose-400" />
              )}
            </button>

            {/* Screen Share Toggle Button with Quick Options */}
            <div className="relative flex items-center">
              <button
                title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
                onClick={toggleScreenShare}
                className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                  isScreenSharing 
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20' 
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                <Monitor className="w-4 h-4" />
              </button>

              {!isScreenSharing && (
                <button
                  type="button"
                  title="Screen Share Options"
                  onClick={() => setShowScreenShareMenu(!showScreenShareMenu)}
                  className="p-1 -ml-1 text-slate-400 hover:text-cyan-400 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              )}

              {/* Quick Screen Share Dropdown Menu */}
              {showScreenShareMenu && !isScreenSharing && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-56 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl p-1.5 text-xs z-30 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 mb-1">
                    Screen Presenter
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowScreenShareMenu(false);
                      toggleScreenShare();
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Native Screen / Window</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowScreenShareMenu(false);
                      startVirtualScreenShare();
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Virtual IDE Presenter</span>
                  </button>
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setShowScreenShareMenu(false)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-300 flex items-center gap-2 transition-colors cursor-pointer border-t border-slate-800/80 mt-1 pt-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                    <span>Open in New Tab ↗</span>
                  </a>
                </div>
              )}
            </div>

            {/* Leave Call Button */}
            <button
              title="Leave Conference"
              onClick={handleLeaveCall}
              className="p-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-md shadow-rose-600/20 active:scale-95 cursor-pointer"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Fullscreen Video Viewer Modal */}
      {fullscreenPeer && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col p-4 sm:p-6 select-none animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFullscreenPeer(null);
          }}
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-slate-200 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: fullscreenPeer.userColor || '#38bdf8' }}
              />
              <span className="text-sm font-semibold tracking-wide text-white">{fullscreenPeer.username}</span>
              {fullscreenPeer.isScreenSharing ? (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                  <Monitor className="w-3 h-3 text-cyan-400" /> Screen Share
                </span>
              ) : (
                <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                  <Camera className="w-3 h-3 text-slate-400" /> Camera Feed
                </span>
              )}
              {fullscreenPeer.isMicLive ? (
                <span className="text-[10px] text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  <Volume2 className="w-3 h-3" /> Audio Live
                </span>
              ) : (
                <span className="text-[10px] text-rose-400 flex items-center gap-1 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                  <VolumeX className="w-3 h-3" /> Muted
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Fit Mode Toggle */}
              <button
                type="button"
                onClick={() => setFullscreenFitMode((prev) => (prev === 'contain' ? 'cover' : 'contain'))}
                title={`Switch to ${fullscreenFitMode === 'contain' ? 'Cover / Crop to Fill' : 'Contain / Fit without Cropping'}`}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Scaling className="w-3.5 h-3.5 text-cyan-400" />
                <span>{fullscreenFitMode === 'contain' ? 'Fit Screen' : 'Fill Screen'}</span>
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setFullscreenPeer(null)}
                title="Exit Fullscreen (Esc)"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 border border-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Main Video Presentation Display */}
          <div className="flex-1 min-h-0 w-full flex items-center justify-center p-2 sm:p-4 relative">
            <FullscreenVideoRenderer
              stream={fullscreenPeer.stream}
              fitMode={fullscreenFitMode}
              isLocal={fullscreenPeer.isLocal}
              isScreenSharing={fullscreenPeer.isScreenSharing}
              username={fullscreenPeer.username}
            />
          </div>

          {/* Bottom Bar Controls for Local User */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 flex-shrink-0">
            <div className="text-[11px] text-slate-500">
              Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[10px]">Esc</kbd> or click outside to exit
            </div>
            {fullscreenPeer.isLocal && (
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleMicrophone}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                    isMicOn ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {isMicOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5 text-rose-400" />}
                  {isMicOn ? 'Mute' : 'Unmute'}
                </button>
                <button
                  onClick={toggleCamera}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                    cameraStatus === 'enabled' ? 'bg-slate-800 text-cyan-400 hover:bg-slate-700 border border-cyan-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {cameraStatus === 'enabled' ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5 text-rose-400" />}
                  Camera
                </button>
                <button
                  onClick={toggleScreenShare}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                    isScreenSharing ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  {isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
                </button>
              </div>
            )}
            <button
              onClick={() => setFullscreenPeer(null)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <Minimize2 className="w-3.5 h-3.5" /> Exit Fullscreen
            </button>
          </div>
        </div>
      )}

      {/* Screen Sharing Help / Iframe Sandbox Resolution Modal */}
      {showScreenShareHelp && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowScreenShareHelp(false);
          }}
        >
          <div className="bg-[#0b0f19] border border-cyan-500/30 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden p-5 sm:p-6 text-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <Monitor className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">Screen Sharing in Preview Frame</h3>
                  <p className="text-[11px] text-slate-400">Browser Security Policy Notice</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScreenShareHelp(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <p className="font-semibold text-amber-300 mb-0.5">Feature restricted by embedded iframe</p>
                  Browsers disallow <code className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-200 font-mono text-[10px]">display-capture</code> inside embedded iframes for security. Choose how you would like to present:
                </div>
              </div>

              {/* Solution 1: Open in Full Tab */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-cyan-500/40 transition-colors">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-white flex items-center gap-1.5 text-xs">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center text-[10px]">1</span>
                    Open Workspace in Full Tab
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30">
                    Recommended
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
                  Opens this workspace outside the iframe in a full browser tab so your browser allows sharing your screen, windows, or Chrome tabs with full native permissions.
                </p>
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowScreenShareHelp(false)}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors shadow-md shadow-cyan-500/20 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open in New Tab (Full Screen Share)
                </a>
              </div>

              {/* Solution 2: Virtual IDE Presenter */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-colors">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-white flex items-center gap-1.5 text-xs">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 font-bold flex items-center justify-center text-[10px]">2</span>
                    Virtual IDE Code Presenter
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-medium">
                    Works in Iframe
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
                  Streams a live 1080p 30fps presentation feed of your active code workspace, syntax highlighting, and live cursor directly into the call without requiring browser permissions.
                </p>
                <button
                  type="button"
                  onClick={startVirtualScreenShare}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Launch Virtual Code Presenter
                </button>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
              <button
                type="button"
                onClick={() => setShowScreenShareHelp(false)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Component for rendering full-resolution video in Fullscreen Mode
const FullscreenVideoRenderer: FC<{
  stream: MediaStream | null;
  fitMode: 'contain' | 'cover';
  isLocal: boolean;
  isScreenSharing: boolean;
  username: string;
}> = ({ stream, fitMode, isLocal, isScreenSharing, username }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      videoRef.current.autoplay = true;
      videoRef.current.playsInline = true;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  if (!stream) {
    return (
      <div className="flex flex-col items-center justify-center text-slate-500">
        <VideoOff className="w-12 h-12 mb-2 opacity-50 text-slate-600" />
        <p className="text-sm font-medium text-slate-400">No active video stream for {username}</p>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      muted={isLocal}
      playsInline
      className={`max-w-full max-h-full rounded-2xl shadow-2xl transition-all ${
        fitMode === 'contain' ? 'object-contain w-auto h-auto max-h-[82vh]' : 'object-cover w-full h-full'
      } ${isLocal && !isScreenSharing ? 'scale-x-[-1]' : ''}`}
    />
  );
};

// Component for rendering each remote peer's stream
const RemotePeerTile: FC<{ 
  peer: PeerMediaInfo;
  selectedSpeakerId?: string;
  registerVideoEl: (el: HTMLVideoElement | null) => void;
  onExpand?: () => void;
}> = ({ peer, selectedSpeakerId, registerVideoEl, onExpand }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const attachRemoteVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    registerVideoEl(node);
    if (node && peer.stream) {
      if (node.srcObject !== peer.stream) {
        node.srcObject = peer.stream;
      }
      node.autoplay = true;
      node.playsInline = true;
      node.play().catch((err) => {
        console.warn('[CODE DEATH WebRTC] Remote peer play warning on attach:', err);
      });
      if (selectedSpeakerId && 'setSinkId' in node) {
        (node as any).setSinkId(selectedSpeakerId).catch(() => {});
      }
    }
  }, [peer.stream, selectedSpeakerId, registerVideoEl]);

  useEffect(() => {
    if (videoRef.current && peer.stream) {
      const el = videoRef.current;
      if (el.srcObject !== peer.stream) {
        el.srcObject = peer.stream;
      }
      el.autoplay = true;
      el.playsInline = true;
      el.play().catch((err) => {
        console.warn('[CODE DEATH WebRTC] Remote peer play warning in effect:', err);
      });
      if (selectedSpeakerId && 'setSinkId' in el) {
        (el as any).setSinkId(selectedSpeakerId).catch(() => {});
      }
    }
  }, [peer.stream, selectedSpeakerId]);

  return (
    <div 
      className={`relative aspect-video w-full bg-slate-950 rounded-xl overflow-hidden border shadow-sm group cursor-pointer transition-all ${
        peer.isScreenSharing ? 'border-cyan-500/60 shadow-cyan-500/10' : 'border-slate-800/90'
      }`}
      onClick={() => onExpand?.()}
    >
      <video
        ref={attachRemoteVideo}
        autoPlay
        playsInline
        className={`w-full h-full block ${peer.isScreenSharing ? 'object-contain bg-slate-950' : 'object-cover'}`}
      />

      {(!peer.isVideoEnabled || !peer.stream) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-500">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-slate-950 mb-1"
            style={{ backgroundColor: peer.userColor || '#38bdf8' }}
          >
            {peer.username[0]?.toUpperCase() || 'P'}
          </div>
          <span className="text-[10px] text-slate-400">Camera Off</span>
        </div>
      )}

      {/* Expand to Fullscreen hover button */}
      <button
        type="button"
        title="Expand to Fullscreen"
        onClick={(e) => {
          e.stopPropagation();
          onExpand?.();
        }}
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 hover:bg-cyan-500 text-slate-200 hover:text-slate-950 opacity-0 group-hover:opacity-100 transition-all backdrop-blur-xs z-20 cursor-pointer shadow-md border border-white/10"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>

      {/* Peer Info Tag */}
      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-xs text-[10px] text-white flex items-center gap-1.5 font-medium border border-white/10 z-10">
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: peer.userColor || '#38bdf8' }}
        />
        <span className="truncate max-w-[100px]">{peer.username}</span>
        {peer.isScreenSharing && (
          <span className="text-[9px] bg-cyan-500/20 text-cyan-300 px-1 py-0.2 rounded border border-cyan-500/30 flex items-center gap-0.5 font-bold">
            <Monitor className="w-2.5 h-2.5" /> Screen
          </span>
        )}
        {peer.isAudioEnabled ? (
          <Volume2 className="w-3 h-3 text-emerald-400 ml-1" />
        ) : (
          <VolumeX className="w-3 h-3 text-rose-400 ml-1" />
        )}
      </div>
    </div>
  );
};
