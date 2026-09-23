import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  getFirestore, 
  Firestore 
} from 'firebase/firestore';
import fallbackConfig from '../firebase-applet-config.json';

const rawConfig = (fallbackConfig || {}) as Record<string, any>;

// Ensure all config parameters belong to the exact same Firebase project
const projectId = (
  import.meta.env.VITE_FIREBASE_PROJECT_ID ||
  rawConfig.projectId ||
  'code-collab-ee33d'
).trim();

// Important guard for Vercel/cloud deployments:
// The Firebase authDomain MUST point to the Firebase OAuth handler domain (<projectId>.firebaseapp.com)
// unless custom domain auth proxy is configured. Setting this to a *.vercel.app domain will break
// signInWithPopup because Vercel doesn't host the /__/auth/handler endpoint.
let authDomain = (
  import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
  rawConfig.authDomain ||
  `${projectId}.firebaseapp.com`
).trim();

if (!authDomain || authDomain.includes('vercel.app') || authDomain.includes('localhost') || authDomain.includes('run.app')) {
  authDomain = `${projectId}.firebaseapp.com`;
}

const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY || rawConfig.apiKey || 'AIzaSyCsCmAWX2Dbq63KFN6J_NhSEIBWH4Fj_ag').trim(),
  authDomain,
  projectId,
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || rawConfig.storageBucket || `${projectId}.firebasestorage.app`).trim(),
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || rawConfig.messagingSenderId || '1059297602808').trim(),
  appId: (import.meta.env.VITE_FIREBASE_APP_ID || rawConfig.appId || '1:1059297602808:web:e5b624eb1a695daa255f0d').trim(),
  measurementId: (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || rawConfig.measurementId || 'G-G8YNQ5J9RW').trim(),
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

const databaseId = rawConfig.firestoreDatabaseId;

let firestoreDb: Firestore;
try {
  firestoreDb = databaseId
    ? initializeFirestore(app, { experimentalAutoDetectLongPolling: true }, databaseId)
    : initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
} catch {
  firestoreDb = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
}

export const db = firestoreDb;
export { firebaseConfig };
export default app;

