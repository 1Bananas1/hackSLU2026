import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, User } from 'firebase/auth';
import { auth } from '../services/firebase';
import { upsertUser } from '../services/user';

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

      // Upsert the user profile into Firestore on every sign-in.
      // Creates users/{uid} on first login; keeps email/display_name/last_seen
      // current on subsequent logins.
      if (firebaseUser) {
        void upsertUser(firebaseUser);
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
