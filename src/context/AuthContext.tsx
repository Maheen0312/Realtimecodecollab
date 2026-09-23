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
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signupWithEmail: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  sendResetEmail: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function formatAuthError(err: any): string {
  if (!err) return 'An unexpected error occurred.';
  const code = err.code || '';
  switch (code) {
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
    case 'auth/popup-closed-by-user':
      return 'Sign-in popup was closed before completing.';
    case 'auth/popup-blocked':
      return 'Browser blocked the authentication popup. Please allow popups or use Email & Password.';
    case 'auth/too-many-requests':
      return 'Access to this account has been temporarily disabled due to many failed attempts. Try again later or reset password.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection.';
    case 'auth/operation-not-allowed':
      return 'This sign-in provider is not enabled in the Firebase console. Please check your project settings.';
    default:
      return err.message || 'Authentication failed. Please try again.';
  }
}

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Listen for authentication changes from Firebase
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Sync user username in localStorage for collaborative room display
        const displayName = currentUser.displayName || currentUser.email?.split('@')[0] || 'Developer';
        localStorage.setItem('collab_username', displayName);
        
        // Save/update user profile in Firestore
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
            });
          }
        } catch (e) {
          // Non-blocking firestore sync
          console.warn('Firestore profile sync note:', e);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithEmail = async (email: string, password: string) => {
    try {
      const res = await signInWithEmailAndPassword(auth, email.trim(), password);
      const name = res.user.displayName || res.user.email?.split('@')[0] || 'Developer';
      localStorage.setItem('collab_username', name);
      toast.success(`Welcome back to CODE DEATH, ${name}!`);
    } catch (err: any) {
      const msg = formatAuthError(err);
      toast.error(msg);
      throw new Error(msg);
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
          });
        } catch (e) {
          console.warn('User profile creation warning:', e);
        }
      }
      toast.success(`Account created! Welcome to CODE DEATH, ${name.trim()}!`);
    } catch (err: any) {
      const msg = formatAuthError(err);
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const res = await signInWithPopup(auth, provider);
      const name = res.user.displayName || res.user.email?.split('@')[0] || 'Developer';
      localStorage.setItem('collab_username', name);
      toast.success(`Signed in as ${name}!`);
    } catch (err: any) {
      const msg = formatAuthError(err);
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const sendResetEmail = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
      toast.success('Password reset link sent to your email!');
    } catch (err: any) {
      const msg = formatAuthError(err);
      toast.error(msg);
      throw new Error(msg);
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
