import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  StatusBar,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { createSession, endSession, getSessionHazards, createHazard } from '../../services/api';
import { Hazard, Session } from '../../types';

const DEVICE_ID = 'dashcam_0';
const POLL_INTERVAL_MS = 3000;

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export default function VigilaneLiveDashboard() {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  const [session, setSession] = useState<Session | null>(null);
  const [latestHazard, setLatestHazard] = useState<Hazard | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [reporting, setReporting] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);

  // Pulse + bounce animations
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -8, duration: 600, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim, bounceAnim]);

  // End session on unmount if one is active
  useEffect(() => {
    return () => {
      setSession((s) => {
        if (s) endSession(s.id).catch(() => {});
        return null;
      });
    };
  }, []);

  // Recording timer — only ticks while a session is active
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [session]);

  const handleToggleSession = async () => {
    if (sessionLoading) return;
    setSessionLoading(true);
    try {
      if (session) {
        await endSession(session.id);
        setSession(null);
        setLatestHazard(null);
        setElapsedSeconds(0);
      } else {
        const s = await createSession(DEVICE_ID);
        setSession(s);
      }
    } catch (err) {
      console.error('Session toggle failed:', err);
    } finally {
      setSessionLoading(false);
    }
  };

  // Poll session hazards for live detection
  const pollHazards = useCallback(async () => {
    if (!session) return;
    try {
      const hazards = await getSessionHazards(session.id);
      if (hazards.length > 0) {
        setLatestHazard(hazards[hazards.length - 1]);
      }
    } catch {
      // Silently ignore poll failures
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    pollHazards();
    const interval = setInterval(pollHazards, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session, pollHazards]);

  const handleReportHazard = async () => {
    if (reporting || !session) return;
    setReporting(true);
    try {
      const newHazard = await createHazard({
        session_id: session.id,
        confidence: 1.0,
        labels: ['manual'],
        bboxes: [],
        frame_number: 0,
      });
      // Immediately show the newly-created hazard in the UI
      setLatestHazard(newHazard);
      // Re-poll so the hazard list stays in sync
      await pollHazards();
    } catch (err) {
      console.error('Report hazard failed:', err);
    } finally {
      setReporting(false);
    }
  };

  // Show alert if the most recent hazard is within 30 seconds
  const showAlert = latestHazard != null && (() => {
    const ageMs = Date.now() - new Date(latestHazard.timestamp).getTime();
    return ageMs < 30_000;
  })();

  const alertLabel = showAlert && latestHazard
    ? `${(latestHazard.labels[0] ?? 'hazard').charAt(0).toUpperCase() + (latestHazard.labels[0] ?? 'hazard').slice(1)} detected • ${Math.round(latestHazard.confidence * 100)}% confidence`
    : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ImageBackground
        source={{ uri: 'https://images.unsplash.com/photo-1600030230325-188b89d4fb98?w=800&q=80' }}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      >
        <View style={styles.overlay} />
      </ImageBackground>

      <SafeAreaView style={styles.safeArea}>

        {/* Top Bar */}
        <View style={styles.topBar}>
          <View style={styles.glassPanel}>
            <MaterialIcons name="verified-user" size={20} color={session ? '#34d399' : '#94a3b8'} />
            <View style={styles.statusTextContainer}>
              <Text style={styles.statusTitle}>Vigilane</Text>
              <Text style={styles.statusSubtitle}>{session ? 'SESSION LIVE' : 'NO ACTIVE SESSION'}</Text>
            </View>
          </View>

          <View style={[styles.glassPanel, styles.recPanel]}>
            {session ? (
              <>
                <Animated.View style={[styles.pulsingDot, { transform: [{ scale: pulseAnim }] }]} />
                <Text style={styles.recText}>REC {formatElapsed(elapsedSeconds)}</Text>
              </>
            ) : (
              <Text style={styles.recText}>STANDBY</Text>
            )}
          </View>
        </View>

        {/* AR Detection Box — shown when recent hazard exists */}
        {showAlert && latestHazard && (
          <View style={styles.arLayer}>
            <View style={[styles.arBox, { top: '40%', left: '30%' }]}>
              <View style={styles.arBadge}>
                <MaterialIcons name="warning" size={12} color="#000" />
                <Text style={styles.arBadgeText}>{(latestHazard.labels[0] ?? '').toUpperCase()}</Text>
              </View>
              <Text style={styles.arConfidence}>{Math.round(latestHazard.confidence * 100)}%</Text>
            </View>
          </View>
        )}

        <View style={styles.flexSpacer} />

        {/* Bottom Dashboard */}
        <View style={styles.bottomOverlay}>

          {alertLabel && (
            <Animated.View style={[styles.alertBannerContainer, { transform: [{ translateY: bounceAnim }] }]}>
              <View style={styles.alertBanner}>
                <MaterialIcons name="report-problem" size={28} color="#0f172a" />
                <View style={styles.alertTextContainer}>
                  <Text style={styles.alertTitle}>Hazard Detected</Text>
                  <Text style={styles.alertSubtitle}>{alertLabel}</Text>
                </View>
              </View>
            </Animated.View>
          )}

          <View style={styles.dashGrid}>
            <TouchableOpacity
              style={[
                styles.sessionButton,
                session ? styles.sessionButtonStop : styles.sessionButtonStart,
                sessionLoading && styles.reportButtonDisabled,
              ]}
              activeOpacity={0.8}
              onPress={handleToggleSession}
              disabled={sessionLoading}
            >
              <MaterialIcons
                name={session ? 'stop-circle' : 'play-circle-filled'}
                size={28}
                color="#fff"
              />
              <Text style={styles.reportButtonText}>
                {sessionLoading ? '…' : session ? 'Stop' : 'Start'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.reportButton, (reporting || !session) && styles.reportButtonDisabled]}
              activeOpacity={0.8}
              onPress={handleReportHazard}
              disabled={reporting || !session}
            >
              <MaterialIcons name="add-alert" size={28} color="#fff" />
              <Text style={styles.reportButtonText}>
                {reporting ? 'Reporting…' : 'Report Hazard'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  safeArea: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    zIndex: 20,
  },
  glassPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 24, 34, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 8,
  },
  statusTextContainer: { justifyContent: 'center' },
  statusTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  statusSubtitle: { color: '#94a3b8', fontSize: 10, fontWeight: '600', letterSpacing: 1 },
  recPanel: { gap: 6 },
  pulsingDot: { width: 12, height: 12, backgroundColor: '#ef4444', borderRadius: 6 },
  recText: { color: '#fff', fontSize: 12, fontWeight: '600', fontFamily: 'monospace', letterSpacing: 1 },
  arLayer: { ...StyleSheet.absoluteFillObject, zIndex: 10, pointerEvents: 'none' },
  arBox: {
    position: 'absolute',
    width: 120,
    height: 90,
    borderWidth: 2,
    borderColor: 'rgba(245, 158, 11, 0.8)',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 8,
    justifyContent: 'space-between',
  },
  arBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f59e0b',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderTopLeftRadius: 6,
    borderBottomRightRadius: 8,
    gap: 4,
  },
  arBadgeText: { color: '#000', fontSize: 10, fontWeight: '700' },
  arConfidence: {
    color: '#f59e0b',
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
    alignSelf: 'flex-end',
    paddingRight: 6,
    paddingBottom: 4,
  },
  flexSpacer: { flex: 1 },
  bottomOverlay: { paddingHorizontal: 16, paddingBottom: 20, gap: 16, zIndex: 20 },
  alertBannerContainer: { alignItems: 'center', width: '100%' },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.5)',
    gap: 12,
    width: '100%',
    maxWidth: 400,
  },
  alertTextContainer: { flex: 1 },
  alertTitle: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  alertSubtitle: { color: '#334155', fontSize: 12, fontWeight: '600' },
  dashGrid: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  speedWidget: {
    width: 100,
    height: 100,
    backgroundColor: 'rgba(16, 24, 34, 0.8)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedNumber: { color: '#fff', fontSize: 40, fontWeight: '900', lineHeight: 40 },
  speedUnit: { color: '#94a3b8', fontSize: 12, fontWeight: '700', letterSpacing: 2, marginTop: 4 },
  sessionButton: {
    width: 88,
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 32,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    elevation: 8,
    marginBottom: 16,
  },
  sessionButtonStart: {
    backgroundColor: '#16a34a',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  sessionButtonStop: {
    backgroundColor: '#dc2626',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  reportButton: {
    flex: 1,
    height: 64,
    backgroundColor: '#1973f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 32,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#1973f0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
    marginBottom: 16,
  },
  reportButtonDisabled: { opacity: 0.5 },
  reportButtonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
