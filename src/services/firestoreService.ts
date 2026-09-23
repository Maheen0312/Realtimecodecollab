import { db } from '../firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc,
  collection, 
  getDocs, 
  deleteDoc 
} from 'firebase/firestore';
import { ProjectFile, ChatMessage } from '../types';

export interface FirestoreRoomData {
  id: string;
  name: string;
  ownerId: string;
  hostId: string;
  createdBy: string;
  status: 'active' | 'closed';
  activeFileId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Creates a brand new room document in Firestore with authoritative ownerId.
 * ownerId MUST be the Firebase Auth UID.
 */
export async function createRoomInFirestore(
  roomId: string,
  roomName: string,
  ownerUid: string,
  initialFiles?: ProjectFile[]
): Promise<FirestoreRoomData> {
  if (!ownerUid) {
    throw new Error('A valid Firebase Auth UID is required to create a workspace room.');
  }

  const roomRef = doc(db, 'rooms', roomId);
  const now = new Date().toISOString();
  
  const roomData: FirestoreRoomData = {
    id: roomId,
    name: roomName.trim() || 'CODE DEATH Workspace',
    ownerId: ownerUid,
    hostId: ownerUid,
    createdBy: ownerUid,
    status: 'active',
    activeFileId: 'f_app',
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(roomRef, roomData);

  if (initialFiles && initialFiles.length > 0) {
    await saveFilesToFirestore(roomId, initialFiles);
  }

  return roomData;
}

/**
 * Safe update of room metadata (activeFile, name, etc.).
 * Guarantees that ownerId is NEVER overwritten by room participants or autosaves.
 */
export async function updateRoomMetadataInFirestore(
  roomId: string,
  metadata: { name?: string; activeFileId?: string }
): Promise<void> {
  try {
    const roomRef = doc(db, 'rooms', roomId);
    const updatePayload: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (metadata.name) updatePayload.name = metadata.name;
    if (metadata.activeFileId) updatePayload.activeFileId = metadata.activeFileId;

    await updateDoc(roomRef, updatePayload).catch(async () => {
      await setDoc(roomRef, updatePayload, { merge: true });
    });
  } catch (err) {
    console.warn('Firestore room metadata update warning:', err);
  }
}

/**
 * Legacy compatibility wrapper: Safe room save that preserves existing ownerId.
 */
export async function saveRoomToFirestore(
  roomId: string, 
  roomname: string, 
  ownerIdCandidate: string, 
  activeFileId: string
) {
  try {
    const roomRef = doc(db, 'rooms', roomId);
    const snap = await getDoc(roomRef);

    const now = new Date().toISOString();
    if (snap.exists()) {
      // Document exists: do NOT overwrite ownerId
      const updateData: Record<string, any> = {
        updatedAt: now,
      };
      if (roomname) updateData.name = roomname;
      if (activeFileId) updateData.activeFileId = activeFileId;
      await updateDoc(roomRef, updateData).catch(async () => {
        await setDoc(roomRef, updateData, { merge: true });
      });
    } else {
      // Document does not exist yet: create with candidate as initial owner
      await setDoc(roomRef, {
        id: roomId,
        name: roomname || 'Collaborative Workspace',
        ownerId: ownerIdCandidate || 'anonymous',
        hostId: ownerIdCandidate || 'anonymous',
        createdBy: ownerIdCandidate || 'anonymous',
        status: 'active',
        activeFileId: activeFileId || 'f_app',
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.warn('Firestore room save warning:', err);
  }
}

export async function saveFilesToFirestore(roomId: string, files: ProjectFile[]) {
  try {
    for (const file of files) {
      const fileRef = doc(db, 'rooms', roomId, 'files', file.id);
      await setDoc(fileRef, {
        id: file.id,
        roomId,
        name: file.name,
        path: file.path,
        content: file.content,
        language: file.language,
        isFolder: file.isFolder,
        parentPath: file.parentPath,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }
  } catch (err) {
    console.warn('Firestore files batch save warning:', err);
  }
}

export async function saveFileToFirestore(roomId: string, file: ProjectFile) {
  try {
    const fileRef = doc(db, 'rooms', roomId, 'files', file.id);
    await setDoc(fileRef, {
      id: file.id,
      roomId,
      name: file.name,
      path: file.path,
      content: file.content,
      language: file.language,
      isFolder: file.isFolder,
      parentPath: file.parentPath,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore file save warning:', err);
  }
}

export async function loadRoomFromFirestore(roomId: string) {
  try {
    const roomRef = doc(db, 'rooms', roomId);
    const roomSnap = await getDoc(roomRef);
    if (!roomSnap.exists()) return null;

    const filesRef = collection(db, 'rooms', roomId, 'files');
    const filesSnap = await getDocs(filesRef);
    const files: ProjectFile[] = [];
    filesSnap.forEach((docSnap) => {
      files.push(docSnap.data() as ProjectFile);
    });

    return {
      room: roomSnap.data() as FirestoreRoomData,
      files,
    };
  } catch (err) {
    console.warn('Firestore room load error:', err);
    return null;
  }
}

export async function deleteFileFromFirestore(roomId: string, fileId: string) {
  try {
    const fileRef = doc(db, 'rooms', roomId, 'files', fileId);
    await deleteDoc(fileRef);
  } catch (err) {
    console.warn('Firestore file deletion warning:', err);
  }
}

export async function replaceWorkspaceInFirestore(
  roomId: string, 
  newFiles: ProjectFile[], 
  projectName?: string, 
  activeFileId?: string
) {
  try {
    // 1. Clear existing files for this room
    const filesRef = collection(db, 'rooms', roomId, 'files');
    const existingSnap = await getDocs(filesRef);
    const deletePromises: Promise<void>[] = [];
    existingSnap.forEach((docSnap) => {
      deletePromises.push(deleteDoc(docSnap.ref));
    });
    await Promise.all(deletePromises);

    // 2. Save only the imported files
    await saveFilesToFirestore(roomId, newFiles);

    // 3. Update room document metadata (preserving ownerId)
    const roomRef = doc(db, 'rooms', roomId);
    const updateData: any = {
      updatedAt: new Date().toISOString(),
    };
    if (projectName) updateData.name = projectName;
    if (activeFileId) updateData.activeFileId = activeFileId;
    await setDoc(roomRef, updateData, { merge: true });
  } catch (err) {
    console.warn('Firestore workspace replacement warning:', err);
  }
}

export async function saveMessageToFirestore(roomId: string, msg: ChatMessage) {
  try {
    const msgRef = doc(db, 'rooms', roomId, 'messages', msg.id);
    await setDoc(msgRef, {
      id: msg.id,
      roomId,
      senderId: msg.senderId || 'anonymous',
      senderName: msg.sender,
      senderColor: msg.userColor || '#38bdf8',
      text: msg.text,
      timestamp: msg.timestamp,
    });
  } catch (err) {
    console.warn('Firestore message save warning:', err);
  }
}

export async function transferRoomOwnershipInFirestore(
  roomId: string,
  callerUid: string,
  targetUid: string
): Promise<boolean> {
  try {
    const roomRef = doc(db, 'rooms', roomId);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return false;
    const data = snap.data();
    if (data.ownerId !== callerUid && data.hostId !== callerUid) {
      throw new Error('Only the current room host can transfer ownership.');
    }
    const now = new Date().toISOString();
    await updateDoc(roomRef, {
      ownerId: targetUid,
      hostId: targetUid,
      updatedAt: now,
    });
    return true;
  } catch (err) {
    console.warn('Transfer room ownership error:', err);
    throw err;
  }
}

export async function closeRoomInFirestore(roomId: string, callerUid: string): Promise<boolean> {
  try {
    const roomRef = doc(db, 'rooms', roomId);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return false;
    const data = snap.data();
    if (data.ownerId !== callerUid) {
      throw new Error('Only the room owner can close the room.');
    }
    await updateDoc(roomRef, {
      status: 'closed',
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    console.warn('Close room error:', err);
    return false;
  }
}
