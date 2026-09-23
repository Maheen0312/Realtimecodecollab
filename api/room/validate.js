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
    return res.status(400).json({ valid: false, message: 'Room ID is required' });
  }

  const { projectId } = getFirebaseConfig();

  // If projectId is present, verify in Firestore
  if (projectId) {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/rooms/${encodeURIComponent(targetId)}`;
      const checkRes = await fetch(url);
      if (checkRes.status === 200) {
        const docData = await checkRes.json();
        const roomName = docData.fields?.name?.stringValue || 'CODE DEATH Workspace';
        return res.status(200).json({
          valid: true,
          roomname: roomName,
          isReadOnly: false,
        });
      }
    } catch {
      // Fallback
    }
  }

  // Allow standard room IDs
  return res.status(200).json({
    valid: true,
    roomname: 'CODE DEATH Workspace',
    isReadOnly: false,
  });
}
