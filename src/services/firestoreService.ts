import { db } from '../firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  getDocs, 
  deleteDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { ProjectFile, ChatMessage } from '../types';

export async function saveRoomToFirestore(
  roomId: string, 
  roomname: string, 
  ownerId: string, 
  activeFileId: string
) {
  try {
    const roomRef = doc(db, 'rooms', roomId);
    await setDoc(roomRef, {
      id: roomId,
      name: roomname,
      ownerId: ownerId || 'anonymous',
      hostId: ownerId || 'anonymous',
      activeFileId,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
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
      room: roomSnap.data(),
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
    // 1. Clear all existing files for this room to avoid mixing with demo files
    const filesRef = collection(db, 'rooms', roomId, 'files');
    const existingSnap = await getDocs(filesRef);
    const deletePromises: Promise<void>[] = [];
    existingSnap.forEach((docSnap) => {
      deletePromises.push(deleteDoc(docSnap.ref));
    });
    await Promise.all(deletePromises);

    // 2. Save only the imported files
    await saveFilesToFirestore(roomId, newFiles);

    // 3. Update room document metadata
    if (projectName || activeFileId) {
      const roomRef = doc(db, 'rooms', roomId);
      const updateData: any = {
        updatedAt: new Date().toISOString(),
      };
      if (projectName) updateData.name = projectName;
      if (activeFileId) updateData.activeFileId = activeFileId;
      await setDoc(roomRef, updateData, { merge: true });
    }
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
