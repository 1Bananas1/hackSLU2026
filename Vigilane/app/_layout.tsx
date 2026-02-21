import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/context/AuthContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

// ---------------------------------------------------------------------------
// Auth guard — runs inside the AuthProvider so useAuth() works.
// ---------------------------------------------------------------------------

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;

    const onLoginScreen = segments[0] === 'login';

    if (!user && !onLoginScreen) {
      // Not signed in — send to login
      router.replace('/login');
    } else if (user && onLoginScreen) {
      // Already signed in — skip the login screen
      router.replace('/(tabs)/liveDashboard');
    }
  }, [user, loading, segments]);

  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Root layout
// ---------------------------------------------------------------------------

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider value={DarkTheme}>
        <AuthGuard>
          <Stack>
            <Stack.Screen name="login"       options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)"      options={{ headerShown: false }} />
            <Stack.Screen name="hazardDetails" options={{ headerShown: false }} />
          </Stack>
        </AuthGuard>
        <StatusBar style="light" />
      </ThemeProvider>
    </AuthProvider>
  );
}
