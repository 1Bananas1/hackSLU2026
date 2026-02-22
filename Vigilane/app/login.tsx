import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import * as Google from 'expo-auth-session/providers/google';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from '@/services/firebase';
import { useAuth } from '@/context/AuthContext';

// ---------------------------------------------------------------------------
// Design tokens (matches the rest of the app)
// ---------------------------------------------------------------------------

const colors = {
  background:   '#101822',
  surface:      '#1a2432',
  primary:      '#1973f0',
  primaryLight: 'rgba(25, 115, 240, 0.15)',
  textPrimary:  '#ffffff',
  textSecondary:'#94a3b8',
  textMuted:    '#64748b',
  border:       '#1e293b',
  danger:       '#ef4444',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LoginScreen() {
  const { user, loading } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  // All three client IDs are read from .env.local via EXPO_PUBLIC_* vars.
  // On Android the native PKCE flow requires a custom dev build (npx expo
  // run:android) whose debug keystore SHA-1 is registered in Google Cloud
  // Console. This will NOT work inside Expo Go (exp:// redirect is rejected).
  const [, response, promptAsync] = Google.useAuthRequest({
    webClientId:     process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
    iosClientId:     process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
  });

  // Handle the OAuth callback (native only — web uses signInWithPopup)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!response) return;

    console.log('[Auth] response type:', response.type);

    if (response.type === 'success') {
      // Android code-exchange (PKCE) → token lives in response.authentication
      // Implicit flow fallback → token lives in response.params
      const idToken =
        response.authentication?.idToken ??
        response.params?.id_token ??
        null;

      if (!idToken) {
        setAuthError(
          'Google did not return an ID token. ' +
          'Make sure the Android OAuth client ID matches the signing key.',
        );
        setSigningIn(false);
        return;
      }

      const credential = GoogleAuthProvider.credential(idToken);
      signInWithCredential(auth, credential).catch((err: Error) => {
        console.error('[Auth] signInWithCredential error:', err);
        setAuthError(err.message);
        setSigningIn(false);
      });
    } else if (response.type === 'error') {
      const msg =
        response.error?.message ??
        response.error?.code ??
        'Google sign-in failed.';
      console.error('[Auth] OAuth error:', msg);
      setAuthError(msg);
      setSigningIn(false);
    } else if (response.type === 'cancel' || response.type === 'dismiss') {
      setSigningIn(false);
    }
  }, [response]);

  const handleDevBypass = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithEmailAndPassword(auth, 'dev@vigilane.dev', 'devpass123');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Dev sign-in failed.';
      setAuthError(msg);
      setSigningIn(false);
    }
  };

  const handleSignIn = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      if (Platform.OS === 'web') {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      } else {
        // Opens Google sign-in via Chrome Custom Tab on Android
        await promptAsync();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed.';
      setAuthError(msg);
      setSigningIn(false);
    }
  };

  // Already signed in — skip login.
  if (!loading && user) return <Redirect href="/(tabs)/liveDashboard" />;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* ── Branding ──────────────────────────────────────────────────────── */}
      <View style={styles.brandingContainer}>
        <View style={styles.logoCircle}>
          <MaterialIcons name="visibility" size={48} color={colors.primary} />
        </View>
        <Text style={styles.appName}>Vigilane</Text>
        <Text style={styles.tagline}>AI-powered road hazard detection</Text>
      </View>

      {/* ── Feature bullets ───────────────────────────────────────────────── */}
      <View style={styles.featuresContainer}>
        <FeatureLine icon="videocam"      text="Real-time dashcam hazard detection" />
        <FeatureLine icon="notifications" text="Instant audio & visual alerts" />
        <FeatureLine icon="history"       text="Searchable incident history" />
        <FeatureLine icon="security"      text="Auto-report to local authorities" />
      </View>

      {/* ── Sign-in card ──────────────────────────────────────────────────── */}
      <View style={styles.signInCard}>
        <Text style={styles.signInHeading}>Get started</Text>
        <Text style={styles.signInSubtext}>
          Sign in to sync your settings and report history across devices.
        </Text>

        {authError && (
          <View style={styles.errorBox}>
            <MaterialIcons name="error-outline" size={16} color={colors.danger} />
            <Text style={styles.errorText}>{authError}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.googleButton, signingIn && styles.googleButtonDisabled]}
          onPress={handleSignIn}
          disabled={signingIn}
          activeOpacity={0.8}
        >
          {signingIn ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <MaterialIcons name="g-mobiledata" size={22} color={colors.primary} />
          )}
          <Text style={styles.googleButtonText}>
            {signingIn ? 'Signing in…' : 'Continue with Google'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          By continuing you agree to our Terms of Service and Privacy Policy.
        </Text>

        {__DEV__ && (
          <TouchableOpacity style={styles.devButton} onPress={handleDevBypass} disabled={signingIn}>
            <Text style={styles.devButtonText}>Dev bypass</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sub-component
// ---------------------------------------------------------------------------

function FeatureLine({ icon, text }: { icon: keyof typeof MaterialIcons.glyphMap; text: string }) {
  return (
    <View style={styles.featureLine}>
      <View style={styles.featureIconWrap}>
        <MaterialIcons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },

  // Branding
  brandingContainer: { alignItems: 'center', marginTop: 24 },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(25, 115, 240, 0.3)',
  },
  appName: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },

  // Features
  featuresContainer: {
    gap: 14,
    paddingVertical: 8,
  },
  featureLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '500',
    flex: 1,
  },

  // Sign-in card
  signInCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    gap: 14,
  },
  signInHeading: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  signInSubtext: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(25, 115, 240, 0.4)',
    paddingVertical: 14,
  },
  googleButtonDisabled: {
    opacity: 0.5,
  },
  googleButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  disclaimer: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  devButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  devButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
});
