import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, User } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuthContextValue = {
  /** The currently signed-in Firebase user, or null if logged out. */
  user: User | null;
  /** True while the initial auth state is being resolved. */
  loading: boolean;
  /** Sign the user out of Firebase. */
  signOut: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signOut: async () => {},
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      if (firebaseUser) {
        // Upsert the user document so the `users` collection always reflects
        // the latest profile. merge: true means other fields (e.g. settings)
        // are never overwritten.
        console.log('[AuthContext] upserting user doc for', firebaseUser.uid);
        setDoc(
          doc(db, 'users', firebaseUser.uid),
          {
            uid:          firebaseUser.uid,
            email:        firebaseUser.email,
            display_name: firebaseUser.displayName,
            photo_url:    firebaseUser.photoURL,
            last_seen:    serverTimestamp(),
          },
          { merge: true },
        ).then(() => {
          console.log('[AuthContext] user doc upserted OK');
        }).catch((err) => {
          // Always log — if this says "permission-denied" you need to update
          // your Firestore security rules to allow writes on users/{uid}.
          console.error('[AuthContext] user doc upsert FAILED:', err);
        });
      }
    });
    return unsubscribe;
  }, []);

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useAuth = () => useContext(AuthContext);
