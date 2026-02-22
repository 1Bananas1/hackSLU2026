import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { useIsFocused } from '@react-navigation/native';
import { usePotholeDetector } from '@/hooks/usePotholeDetector';
import { writeHazard } from '@/services/firestore';
import { createSession, endSession, createHazard, getSessionHazards } from '@/services/api';
import type { Hazard, Session } from '@/types';
import { Toast, useToast } from '@/components/toast';

const POLL_INTERVAL_MS = 3000;
const USE_BACKEND_POLLING = (process.env.EXPO_PUBLIC_USE_BACKEND_POLLING ?? 'false') === 'true';

const DEVICE_ID_KEY = 'vigilane_device_id_v1';

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function getOrCreateDeviceId(prefix: string): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (existing) return existing;

    const created = `${prefix}-${randomId()}`;
    await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return `${prefix}-${randomId()}`;
  }
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

function mphFromMetersPerSecond(mps: number): number {
  return mps * 2.2369362920544;
}

export default function VigilaneLiveDashboard() {
  const isFocused = useIsFocused();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  const [session, setSession] = useState<Session | null>(null);
  const [latestHazard, setLatestHazard] = useState<Hazard | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [reporting, setReporting] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const { toast, showToast } = useToast();

  const [deviceId, setDeviceId] = useState<string | null>(null);

  // ── Camera ────────────────────────────────────────────────────────────────
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const { frameProcessor, lastAlert, modelState } = usePotholeDetector();

  // ── Speed (GPS) ───────────────────────────────────────────────────────────
  const [speedMps, setSpeedMps] = useState<number | null>(null);
  const speedLabel = useMemo(() => {
    if (speedMps == null || speedMps < 0) return '—';
    return `${Math.round(mphFromMetersPerSecond(speedMps))} mph`;
  }, [speedMps]);

  useEffect(() => {
    void (async () => {
      const id = await getOrCreateDeviceId(`${Platform.OS}_dashcam`);
      setDeviceId(id);
    })();
  }, []);

  // Request camera permission on mount.
  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  // GPS speed watcher (non-blocking). If permission denied, widget shows "—".
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setSpeedMps(null);
          return;
        }

        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 1000,
            distanceInterval: 1,
          },
          (pos) => {
            const s = pos.coords.speed;
            setSpeedMps(typeof s === 'number' ? s : null);
          },
        );
      } catch {
        setSpeedMps(null);
      }
    })();

    return () => {
      if (sub) sub.remove();
    };
  }, []);

  // ── Animations ────────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -8, duration: 600, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
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
    if (!deviceId) {
      showToast('Device ID not ready yet', 'info');
      return;
    }

    setSessionLoading(true);
    try {
      if (session) {
        await endSession(session.id);
        setSession(null);
        setLatestHazard(null);
        setElapsedSeconds(0);
        showToast('Session ended', 'info');
      } else {
        const s = await createSession(deviceId);
        setSession(s);
        showToast('Session started', 'success');
      }
    } catch (err) {
      console.error('Session toggle failed:', err);
      showToast('Session error — check connection', 'error');
    } finally {
      setSessionLoading(false);
    }
  };

  // Optional backend polling: keeps API endpoint relevant for hybrid mode.
  const pollHazards = useCallback(async () => {
    if (!session) return;
    try {
      const hazards = await getSessionHazards(session.id);
      if (!hazards || hazards.length === 0) return;

      const newest = hazards[hazards.length - 1];
      setLatestHazard((prev) => {
        if (!prev) return newest;

        const prevTs = new Date(prev.timestamp).getTime();
        const newTs = new Date(newest.timestamp).getTime();
        return newTs > prevTs ? newest : prev;
      });
    } catch {
      // ignore
    }
  }, [session]);

  useEffect(() => {
    if (!session || !USE_BACKEND_POLLING) return;
    void pollHazards();
    const interval = setInterval(() => void pollHazards(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session, pollHazards]);

  // ── On-device detection handler ───────────────────────────────────────────
  useEffect(() => {
    if (!lastAlert || !session) return;

    const localHazard: Hazard = {
      id: `local-${lastAlert.timestamp}`,
      session_id: session.id,
      event_type: lastAlert.labels[0] ?? 'pothole',
      confidence: lastAlert.confidence,
      labels: lastAlert.labels,
      bboxes: lastAlert.bboxes,
      frame_number: 0,
      timestamp: new Date(lastAlert.timestamp).toISOString(),
      status: 'pending',
    };

    setLatestHazard(localHazard);

    void writeHazard(session.id, {
      confidence: lastAlert.confidence,
      bboxes: lastAlert.bboxes,
      labels: lastAlert.labels,
      frameNumber: 0,
    });

    const clearTimer = setTimeout(() => setLatestHazard(null), 30_000);
    return () => clearTimeout(clearTimer);
  }, [lastAlert, session]);

  // ── Manual report button ──────────────────────────────────────────────────
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
      setLatestHazard(newHazard);
      showToast('Hazard reported!', 'success');
    } catch (err) {
      console.error('Report hazard failed:', err);
      showToast('Failed to report hazard', 'error');
    } finally {
      setReporting(false);
    }
  };

  const showAlert =
    latestHazard != null &&
    (() => {
      const ageMs = Date.now() - new Date(latestHazard.timestamp).getTime();
      return ageMs < 30_000;
    })();

  const alertLabel =
    showAlert && latestHazard
      ? `${(latestHazard.labels[0] ?? 'hazard').charAt(0).toUpperCase() + (latestHazard.labels[0] ?? 'hazard').slice(1)} detected • ${Math.round(latestHazard.confidence * 100)}% confidence`
      : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <Toast {...toast} />


      {hasPermission && device != null ? (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isFocused}
          frameProcessor={frameProcessor}
          pixelFormat="yuv"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0a1628' }]} />
      )}

      <View style={styles.overlay} />

      {modelState === 'loading' && (
        <View style={styles.modelLoadingBadge}>
          <Text style={styles.modelLoadingText}>Loading model…</Text>
        </View>
      )}

      <SafeAreaView style={styles.safeArea}>
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

        {/* Speed widget */}
        <View style={styles.speedWidget}>
          <MaterialIcons name="speed" size={18} color="#e2e8f0" />
          <Text style={styles.speedText}>{speedLabel}</Text>
        </View>

        {showAlert && latestHazard && latestHazard.bboxes.length > 0 && (
          <View style={styles.arLayer}>
            {latestHazard.bboxes.map((bbox, i) => (
              <View
                key={i}
                style={[
                  styles.arBox,
                  {
                    top: `${(bbox.y1 * 100).toFixed(1)}%` as unknown as number,
                    left: `${(bbox.x1 * 100).toFixed(1)}%` as unknown as number,
                    width: `${((bbox.x2 - bbox.x1) * 100).toFixed(1)}%` as unknown as number,
                    height: `${((bbox.y2 - bbox.y1) * 100).toFixed(1)}%` as unknown as number,
                  },
                ]}
              >
                <View style={styles.arBadge}>
                  <MaterialIcons name="warning" size={12} color="#000" />
                  <Text style={styles.arBadgeText}>
                    {(latestHazard.labels[i] ?? latestHazard.labels[0] ?? '').toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.arConfidence}>{Math.round(latestHazard.confidence * 100)}%</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.flexSpacer} />

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
              <MaterialIcons name={session ? 'stop-circle' : 'play-circle-filled'} size={28} color="#fff" />
              <Text style={styles.reportButtonText}>{sessionLoading ? '…' : session ? 'Stop' : 'Start'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.reportButton, (reporting || !session) && styles.reportButtonDisabled]}
              activeOpacity={0.8}
              onPress={handleReportHazard}
              disabled={reporting || !session}
            >
              <MaterialIcons name="add-alert" size={28} color="#fff" />
              <Text style={styles.reportButtonText}>{reporting ? 'Reporting…' : 'Report Hazard'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  safeArea: { flex: 1 },
  modelLoadingBadge: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    zIndex: 30,
  },
  modelLoadingText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
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

  speedWidget: {
    marginTop: 10,
    marginLeft: 16,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(16, 24, 34, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 20,
  },
  speedText: { color: '#e2e8f0', fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },

  arLayer: { ...StyleSheet.absoluteFillObject, zIndex: 10, pointerEvents: 'none' },
  arBox: {
    position: 'absolute',
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