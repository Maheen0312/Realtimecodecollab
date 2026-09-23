import fs from 'fs';
import path from 'path';

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
      // Ignore
    }
  }
  return { apiKey, projectId };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { roomId } = req.query;
  const targetId = (roomId || '').trim();

  if (!targetId) {
    return res.status(400).json({ 
      valid: false, 
      code: 'BAD_REQUEST',
      message: 'Room ID is required.' 
    });
  }

  // Extract optional Bearer token
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  let idToken = '';
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    idToken = authHeader.substring(7).trim();
  }

  const { projectId } = getFirebaseConfig();

  // If projectId is configured, verify against Firestore document
  if (projectId) {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/rooms/${encodeURIComponent(targetId)}`;
      const headers = {};
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const checkRes = await fetch(url, { headers });
      
      if (checkRes.status === 404) {
        return res.status(200).json({
          valid: false,
          code: 'ROOM_NOT_FOUND',
          message: 'Room does not exist.',
        });
      }

      if (checkRes.status === 401 || checkRes.status === 403) {
        // If unauthenticated access is rejected by Firestore security rules
        if (!idToken) {
          return res.status(200).json({
            valid: false,
            code: 'UNAUTHENTICATED',
            message: 'User authentication required to join this room.',
          });
        }
      }

      if (checkRes.status === 200) {
        const docData = await checkRes.json();
        const fields = docData.fields || {};
        const status = fields.status?.stringValue || 'active';
        const name = fields.name?.stringValue || 'CODE DEATH Workspace';
        const ownerId = fields.ownerId?.stringValue || fields.hostId?.stringValue || fields.createdBy?.stringValue || '';

        if (status === 'closed' || status !== 'active') {
          return res.status(200).json({
            valid: false,
            code: 'ROOM_CLOSED',
            message: 'This room has been closed.',
          });
        }

        return res.status(200).json({
          valid: true,
          roomId: targetId,
          name,
          roomname: name,
          ownerId,
          status: 'active',
          isReadOnly: false,
        });
      }
    } catch (err) {
      console.warn('Firestore validation lookup error:', err);
    }
  }

  // Fallback if network was unable to query Firestore REST API
  return res.status(200).json({
    valid: true,
    roomId: targetId,
    name: 'CODE DEATH Workspace',
    roomname: 'CODE DEATH Workspace',
    ownerId: '',
    status: 'active',
    isReadOnly: false,
  });
}
