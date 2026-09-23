import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Helper to get Firebase API key and Project ID
function getFirebaseConfig() {
  let apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || '';
  let projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '';

  if (!apiKey || !projectId) {
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        apiKey = apiKey || raw.apiKey;
        projectId = projectId || raw.projectId;
      }
    } catch {
      // Ignore reading error
    }
  }
  return { apiKey, projectId };
}

// Verify Firebase ID Token via Google Identity Toolkit REST API
async function verifyFirebaseToken(idToken, apiKey) {
  if (!idToken || !apiKey) return null;
  try {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.users && data.users[0] ? data.users[0] : null;
  } catch (err) {
    console.error('Token verification error:', err);
    return null;
  }
}

// Check if room document exists in Firestore
async function checkRoomExists(projectId, roomId, idToken) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/rooms/${encodeURIComponent(roomId)}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

// Save room document to Firestore via REST API
async function saveRoomToFirestore(projectId, roomId, roomName, hostId, idToken) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/rooms/${encodeURIComponent(roomId)}`;
    const now = new Date().toISOString();
    const body = {
      fields: {
        id: { stringValue: roomId },
        name: { stringValue: roomName },
        hostId: { stringValue: hostId },
        ownerId: { stringValue: hostId },
        createdAt: { stringValue: now },
        updatedAt: { stringValue: now },
      },
    };

    await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn('Could not persist room via Firestore REST API:', err);
  }
}

export default async function handler(req, res) {
  // 1. CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. Method Validation
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Only POST is accepted.',
      code: 'METHOD_NOT_ALLOWED',
    });
  }

  // 3. Extract and Verify Authentication
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  let idToken = '';
  if (authHeader.startsWith('Bearer ')) {
    idToken = authHeader.substring(7).trim();
  }

  const { apiKey, projectId } = getFirebaseConfig();

  if (!idToken) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Missing Bearer authorization token.',
      code: 'UNAUTHORIZED',
    });
  }

  const verifiedUser = await verifyFirebaseToken(idToken, apiKey);
  if (!verifiedUser || !verifiedUser.localId) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication credentials.',
      code: 'UNAUTHORIZED',
    });
  }

  const authenticatedUid = verifiedUser.localId;

  // 4. Validate Request Body
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({
        success: false,
        message: 'Malformed JSON in request body.',
        code: 'BAD_REQUEST',
      });
    }
  }

  const { roomId, roomName, roomname, hostId } = body || {};

  // Host verification
  if (hostId && hostId !== authenticatedUid) {
    return res.status(403).json({
      success: false,
      message: 'Host ID does not match authenticated user.',
      code: 'FORBIDDEN',
    });
  }

  // Room ID validation
  let targetRoomId = (roomId || '').trim();
  if (targetRoomId) {
    // Alphanumeric + underscore + hyphen, 3-64 chars
    if (!/^[a-zA-Z0-9_-]{3,64}$/.test(targetRoomId)) {
      return res.status(400).json({
        success: false,
        message: 'Room ID must be 3-64 characters and contain only letters, numbers, underscores, or hyphens.',
        code: 'INVALID_ROOM_ID',
      });
    }

    // Check collision
    if (projectId) {
      const exists = await checkRoomExists(projectId, targetRoomId, idToken);
      if (exists) {
        return res.status(409).json({
          success: false,
          message: 'Room ID already exists. Choose another ID.',
          code: 'ROOM_ALREADY_EXISTS',
        });
      }
    }
  } else {
    // Generate secure random room ID
    targetRoomId = 'cd_' + crypto.randomBytes(4).toString('hex');
  }

  // Room name validation
  const defaultName = `${verifiedUser.displayName || verifiedUser.email?.split('@')[0] || 'Developer'}'s Workspace`;
  const targetRoomName = (roomName || roomname || defaultName).trim();
  if (targetRoomName.length > 100) {
    return res.status(400).json({
      success: false,
      message: 'Room name must be under 100 characters.',
      code: 'INVALID_ROOM_NAME',
    });
  }

  // 5. Persist to Firestore
  if (projectId) {
    await saveRoomToFirestore(projectId, targetRoomId, targetRoomName, authenticatedUid, idToken);
  }

  const now = new Date().toISOString();

  // 6. Return standard success JSON
  return res.status(201).json({
    success: true,
    room: {
      roomId: targetRoomId,
      roomName: targetRoomName,
      hostId: authenticatedUid,
      createdAt: now,
    },
  });
}
