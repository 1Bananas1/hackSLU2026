import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Switch,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Settings } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { DEFAULT_SETTINGS, getUserSettings, saveUserSettings } from '../../services/firestore';

const colors = {
  background: '#101822',
  surface: '#1a2432',
  primary: '#1973f0',
  primaryLight: 'rgba(25, 115, 240, 0.2)',
  textPrimary: '#ffffff',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  border: '#1e293b',
  switchTrackFalse: '#334155',
  switchTrackTrue: '#1973f0',
};

export default function SafetySettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const { user, signOut } = useAuth();

  // Load settings from Firestore when the user is available.
  useEffect(() => {
    if (!user) return;
    setSettingsLoaded(false);
    getUserSettings(user.uid).then((s) => {
      setSettings(s);
      setSettingsLoaded(true);
    });
  }, [user]);

  // Auto-save to Firestore whenever settings change (after initial load).
  const isFirstSave = useRef(true);
  useEffect(() => {
    if (!settingsLoaded || !user) return;
    // Skip the very first fire that occurs right after loading.
    if (isFirstSave.current) { isFirstSave.current = false; return; }
    saveUserSettings(user.uid, settings);
  }, [settings, settingsLoaded, user]);

  const toggle = (key: keyof Settings, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleRestoreDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
    if (user) saveUserSettings(user.uid, DEFAULT_SETTINGS);
  };

  const doSignOut = () => {
    signOut().catch((err) => {
      console.error('[Settings] signOut failed:', err);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', 'Failed to sign out. Please try again.');
      }
    });
  };

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      // Alert.alert on web delegates to window.confirm, whose callback
      // reliability varies across browsers. Call window.confirm directly.
      if (window.confirm('Are you sure you want to sign out?')) {
        doSignOut();
      }
      return;
    }
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: doSignOut },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Safety Settings</Text>
        {!settingsLoaded && <ActivityIndicator size="small" color={colors.primary} style={styles.headerSpinner} />}
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>

        {/* Active Detection Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ACTIVE DETECTION</Text>
          <View style={[styles.cardGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>

            <View style={[styles.cardRow, { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
              <View style={styles.cardRowLeft}>
                <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
                  <MaterialIcons name="error-outline" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.rowText, { color: colors.textPrimary }]}>Potholes</Text>
              </View>
              <Switch
                trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.switchTrackFalse}
                onValueChange={(v) => toggle('potholesEnabled', v)}
                value={settings.potholesEnabled}
              />
            </View>

            <View style={[styles.cardRow, { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
              <View style={styles.cardRowLeft}>
                <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
                  <MaterialIcons name="delete-outline" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.rowText, { color: colors.textPrimary }]}>Debris</Text>
              </View>
              <Switch
                trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.switchTrackFalse}
                onValueChange={(v) => toggle('debrisEnabled', v)}
                value={settings.debrisEnabled}
              />
            </View>

            <View style={[styles.cardRow, { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
              <View style={styles.cardRowLeft}>
                <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
                  <MaterialIcons name="directions-car" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.rowText, { color: colors.textPrimary }]}>Stalled Vehicles</Text>
              </View>
              <Switch
                trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.switchTrackFalse}
                onValueChange={(v) => toggle('stalledVehiclesEnabled', v)}
                value={settings.stalledVehiclesEnabled}
              />
            </View>

            <View style={styles.cardRow}>
              <View style={styles.cardRowLeft}>
                <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
                  <MaterialIcons name="car-crash" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.rowText, { color: colors.textPrimary }]}>Traffic Accidents</Text>
              </View>
              <Switch
                trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.switchTrackFalse}
                onValueChange={(v) => toggle('trafficAccidentsEnabled', v)}
                value={settings.trafficAccidentsEnabled}
              />
            </View>

          </View>
        </View>

        {/* Notification Preferences */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>NOTIFICATION PREFERENCES</Text>
          <View style={[styles.cardGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>

            <View style={[styles.cardRow, { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
              <View style={styles.cardRowLeft}>
                <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
                  <MaterialIcons name="volume-up" size={20} color={colors.primary} />
                </View>
                <View style={styles.rowTextColumn}>
                  <Text style={[styles.rowText, { color: colors.textPrimary }]}>Audio Alerts</Text>
                  <Text style={[styles.rowSubtext, { color: colors.textSecondary }]}>Spoken warnings</Text>
                </View>
              </View>
              <Switch
                trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.switchTrackFalse}
                onValueChange={(v) => toggle('audioAlertsEnabled', v)}
                value={settings.audioAlertsEnabled}
              />
            </View>

            <View style={styles.cardRow}>
              <View style={styles.cardRowLeft}>
                <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
                  <MaterialIcons name="flare" size={20} color={colors.primary} />
                </View>
                <View style={styles.rowTextColumn}>
                  <Text style={[styles.rowText, { color: colors.textPrimary }]}>Visual Flashes</Text>
                  <Text style={[styles.rowSubtext, { color: colors.textSecondary }]}>Screen blinks on hazard</Text>
                </View>
              </View>
              <Switch
                trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.switchTrackFalse}
                onValueChange={(v) => toggle('visualFlashesEnabled', v)}
                value={settings.visualFlashesEnabled}
              />
            </View>

          </View>
        </View>

        {/* Auto-Upload Card */}
        <View style={[styles.section, { paddingTop: 8 }]}>
          <View style={[styles.promoCard, { backgroundColor: 'rgba(25, 115, 240, 0.1)', borderColor: colors.primaryLight }]}>
            <View style={styles.watermarkContainer}>
              <MaterialIcons name="cloud-upload" size={80} color={colors.primary} style={{ opacity: 0.1 }} />
            </View>
            <View style={styles.promoHeaderRow}>
              <View style={styles.promoTitleContainer}>
                <MaterialIcons name="security" size={20} color={colors.primary} />
                <Text style={[styles.promoTitle, { color: colors.textPrimary }]}>Auto-upload to Authorities</Text>
              </View>
              <Switch
                trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.switchTrackFalse}
                onValueChange={(v) => toggle('autoUploadEnabled', v)}
                value={settings.autoUploadEnabled}
                style={{ transform: [{ scale: 0.9 }] }}
              />
            </View>
            <Text style={[styles.promoDescription, { color: '#cbd5e1' }]}>
              Automatically verify and send severe incident clips to local DOT/Police services to improve road safety.
            </Text>
          </View>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ACCOUNT</Text>
          <View style={[styles.cardGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>

            {user && (
              <View style={[styles.cardRow, { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
                <View style={styles.cardRowLeft}>
                  <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
                    <MaterialIcons name="account-circle" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.rowTextColumn}>
                    <Text style={[styles.rowText, { color: colors.textPrimary }]}>{user.displayName ?? 'User'}</Text>
                    <Text style={[styles.rowSubtext, { color: colors.textSecondary }]}>{user.email}</Text>
                  </View>
                </View>
              </View>
            )}

            <TouchableOpacity style={styles.cardRow} onPress={handleSignOut} activeOpacity={0.7}>
              <View style={styles.cardRowLeft}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                  <MaterialIcons name="logout" size={20} color="#ef4444" />
                </View>
                <Text style={[styles.rowText, { color: '#ef4444' }]}>Sign out</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
            </TouchableOpacity>

          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity activeOpacity={0.7} onPress={handleRestoreDefaults}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              Restore Default Settings
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: { width: 48, height: 48, justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700' },
  headerSpinner: { position: 'absolute', right: 16 },
  container: { flex: 1 },
  contentContainer: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  cardGroup: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 16 },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowTextColumn: { flexDirection: 'column', justifyContent: 'center' },
  rowText: { fontSize: 16, fontWeight: '500' },
  rowSubtext: { fontSize: 12, marginTop: 2 },
  promoCard: { borderRadius: 12, borderWidth: 1, padding: 20, position: 'relative', overflow: 'hidden' },
  watermarkContainer: { position: 'absolute', top: -10, right: -10, zIndex: 0 },
  promoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    zIndex: 1,
  },
  promoTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
    flex: 1,
    paddingRight: 16,
  },
  promoTitle: { fontSize: 16, fontWeight: '700' },
  promoDescription: { fontSize: 13, lineHeight: 18, zIndex: 1, paddingRight: 24 },
  footer: { alignItems: 'center', paddingVertical: 12 },
  footerText: { fontSize: 14, fontWeight: '500' },
});
