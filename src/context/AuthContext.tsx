import React, { createContext, useContext, useState, useEffect, FC, ReactNode } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  sendPasswordResetEmail,
  updateProfile,
  linkWithCredential,
  AuthCredential
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import toast from 'react-hot-toast';

export interface PendingLinkCredential {
  email: string;
  credential: AuthCredential;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  pendingLinkCredential: PendingLinkCredential | null;
  clearPendingLinkCredential: () => void;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signupWithEmail: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<User>;
  sendResetEmail: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function formatAuthError(err: any): string {
  if (!err) return 'An unexpected error occurred.';
  const code = err.code || '';
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'current domain';

  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was cancelled.';
    case 'auth/popup-blocked':
      return 'Please allow popups for CODE DEATH and try again.';
    case 'auth/cancelled-popup-request':
      return 'A sign-in request is already in progress. Please wait a moment.';
    case 'auth/unauthorized-domain':
      return `This domain (${currentHost}) is not authorized for Firebase Authentication. Add "${currentHost}" in Firebase Console → Authentication → Settings → Authorized domains.`;
    case 'auth/operation-not-allowed':
      return 'Google Sign-In is not enabled in Firebase. Please enable Google in Firebase Console → Authentication → Sign-in method.';
    case 'auth/invalid-api-key':
      return 'Invalid Firebase API key. Please check your Firebase project configuration.';
    case 'auth/invalid-oauth-client-id':
      return 'Invalid OAuth client configuration. Please verify your Google Cloud OAuth 2.0 Web Client ID.';
    case 'auth/account-exists-with-different-credential': {
      const email = err.customData?.email || err.email || 'this email';
      return `An account already exists for ${email} with password login. Enter your password to sign in and link your Google account.`;
    }
    case 'auth/user-not-found':
      return 'No account found with this email address.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please verify your credentials.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email address. Try logging in.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters long.';
    case 'auth/invalid-email':
      return 'Please provide a valid email address.';
    case 'auth/too-many-requests':
      return 'Access to this account has been temporarily disabled due to many failed attempts. Try again later or reset password.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection.';
    case 'auth/user-disabled':
      return 'This user account has been disabled. Please contact support.';
    case 'auth/credential-already-in-use':
      return 'This Google account is already linked to another CODE DEATH user.';
    default:
      return err.message || 'Authentication failed. Please try again.';
  }
}

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pendingLinkCredential, setPendingLinkCredential] = useState<PendingLinkCredential | null>(null);

  useEffect(() => {
    // Listen for authentication changes from Firebase
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Sync user username in localStorage for collaborative room display
        const displayName = currentUser.displayName || currentUser.email?.split('@')[0] || 'Developer';
        localStorage.setItem('collab_username', displayName);
        
        // Save/update user profile in Firestore using currentUser.uid
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            await setDoc(userRef, {
              id: currentUser.uid,
              email: currentUser.email,
              displayName,
              photoURL: currentUser.photoURL || '',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          } else {
            // Keep profile updated if Google provides a photo or name that was empty
            const data = snap.data();
            const updates: Record<string, any> = {};
            if (!data.photoURL && currentUser.photoURL) {
              updates.photoURL = currentUser.photoURL;
            }
            if (!data.displayName && displayName) {
              updates.displayName = displayName;
            }
            if (Object.keys(updates).length > 0) {
              updates.updatedAt = new Date().toISOString();
              await setDoc(userRef, updates, { merge: true });
            }
          }
        } catch (e) {
          // Non-blocking firestore sync note
          console.warn('Firestore profile sync note:', e);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const clearPendingLinkCredential = () => {
    setPendingLinkCredential(null);
  };

  const loginWithEmail = async (email: string, password: string) => {
    try {
      const res = await signInWithEmailAndPassword(auth, email.trim(), password);
      const name = res.user.displayName || res.user.email?.split('@')[0] || 'Developer';
      localStorage.setItem('collab_username', name);

      // Check if user was trying to sign in with Google and had a pending link credential
      if (pendingLinkCredential && pendingLinkCredential.email.toLowerCase() === email.trim().toLowerCase()) {
        try {
          await linkWithCredential(res.user, pendingLinkCredential.credential);
          toast.success('Successfully linked your Google account!');
          setPendingLinkCredential(null);
        } catch (linkErr: any) {
          console.warn('Account link warning:', linkErr);
          if (linkErr.code === 'auth/credential-already-in-use') {
            toast.error('This Google account is already linked to another user profile.');
          }
        }
      } else {
        toast.success(`Welcome back to CODE DEATH, ${name}!`);
      }
    } catch (err: any) {
      const msg = formatAuthError(err);
      toast.error(msg);
      throw err;
    }
  };

  const signupWithEmail = async (name: string, email: string, password: string) => {
    try {
      const res = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (res.user) {
        await updateProfile(res.user, { displayName: name.trim() });
        localStorage.setItem('collab_username', name.trim());
        
        try {
          await setDoc(doc(db, 'users', res.user.uid), {
            id: res.user.uid,
            email: res.user.email,
            displayName: name.trim(),
            photoURL: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } catch (e) {
          console.warn('User profile creation warning:', e);
        }
      }
      toast.success(`Account created! Welcome to CODE DEATH, ${name.trim()}!`);
    } catch (err: any) {
      const msg = formatAuthError(err);
      toast.error(msg);
      throw err;
    }
  };

  const loginWithGoogle = async (): Promise<User> => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      provider.setCustomParameters({ prompt: 'select_account' });

      const res = await signInWithPopup(auth, provider);
      const authenticatedUser = res.user;

      const name = authenticatedUser.displayName || authenticatedUser.email?.split('@')[0] || 'Developer';
      localStorage.setItem('collab_username', name);
      toast.success(`Signed in as ${name}!`);
      setPendingLinkCredential(null);
      return authenticatedUser;
    } catch (err: any) {
      // Handle account exists with different credential
      if (err.code === 'auth/account-exists-with-different-credential') {
        const pendingEmail = err.customData?.email || err.email || '';
        const pendingCred = GoogleAuthProvider.credentialFromError(err);
        if (pendingCred && pendingEmail) {
          setPendingLinkCredential({
            email: pendingEmail,
            credential: pendingCred,
          });
        }
      }

      const msg = formatAuthError(err);
      toast.error(msg, { duration: 6000 });
      throw err;
    }
  };

  const sendResetEmail = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
      toast.success('Password reset link sent to your email!');
    } catch (err: any) {
      const msg = formatAuthError(err);
      toast.error(msg);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('collab_token');
      toast.success('Logged out of CODE DEATH.');
    } catch (err: any) {
      toast.error('Logout error: ' + err.message);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        pendingLinkCredential,
        clearPendingLinkCredential,
        loginWithEmail,
        signupWithEmail,
        loginWithGoogle,
        sendResetEmail,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
