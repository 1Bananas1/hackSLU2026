import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { usePotholeDetector } from '@/hooks/usePotholeDetector';
import { writeHazard } from '@/services/firestore';
import { createSession, endSession, createHazard } from '@/services/api';
import type { Hazard, Session } from '@/types';

// Derive a stable device identifier from the platform so multiple devices
// create distinct sessions.  For production, replace with a persisted UUID
// (e.g. expo-secure-store) or the device's hardware ID.
const DEVICE_ID = `${Platform.OS}_dashcam`;

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

  // ── Camera ────────────────────────────────────────────────────────────────
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const { frameProcessor, lastAlert, modelState } = usePotholeDetector();

  // Request camera permission on mount.
  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  // ── Animations ────────────────────────────────────────────────────────────
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

  // ── Session lifecycle ─────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    createSession(DEVICE_ID)
      .then((s) => { if (mounted) setSession(s); })
      .catch(() => { /* session creation failed — continue without one */ });
    return () => {
      mounted = false;
      setSession((s) => {
        if (s) endSession(s.id).catch(() => {});
        return null;
      });
    };
  }, []);

  // ── Recording timer ───────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── On-device detection handler ───────────────────────────────────────────
  // Runs each time usePotholeDetector fires a new alert (≥30-frame cooldown).
  // Updates the displayed hazard, writes to Firestore + Flask (fire-and-forget),
  // then clears the banner after 30 seconds.
  useEffect(() => {
    if (!lastAlert || !session) return;

    const localHazard: Hazard = {
      id: `local-${lastAlert.timestamp}`,
      session_id: session.id,
      confidence: lastAlert.confidence,
      labels: lastAlert.labels,
      bboxes: lastAlert.bboxes,
      frame_number: 0,
      timestamp: new Date(lastAlert.timestamp).toISOString(),
      status: 'pending',
    };

    setLatestHazard(localHazard);

    // Fire-and-forget persistence — detection must never block on I/O.
    void writeHazard(session.id, {
      confidence: lastAlert.confidence,
      bboxes: lastAlert.bboxes,
      labels: lastAlert.labels,
      frameNumber: 0,
    });

    // Clear banner after 30 seconds (acceptance criteria).
    const clearTimer = setTimeout(() => setLatestHazard(null), 30_000);
    return () => clearTimeout(clearTimer);
  }, [lastAlert, session]);

  // ── Manual report button ──────────────────────────────────────────────────
  const handleReportHazard = async () => {
    if (reporting || !session) return;
    setReporting(true);
    try {
      await createHazard({
        session_id: session.id,
        confidence: 1.0,
        labels: ['manual'],
        bboxes: [],
        frame_number: 0,
      });
    } catch (err) {
      Alert.alert(
        'Report Failed',
        'Could not submit hazard report. Check your connection and try again.',
        [{ text: 'OK' }],
      );
    } finally {
      setReporting(false);
    }
  };

  // ── Alert display logic ───────────────────────────────────────────────────
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

      {/* ── Live camera feed ─────────────────────────────────────────────── */}
      {hasPermission && device != null ? (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive
          frameProcessor={frameProcessor}
          pixelFormat="yuv"
        />
      ) : (
        // Fallback dark background while awaiting permission / camera device.
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0a1628' }]} />
      )}

      {/* Semi-transparent overlay so UI text remains readable over the feed */}
      <View style={styles.overlay} />

      {/* Model-loading indicator (shown until TFLite model is ready) */}
      {modelState === 'loading' && (
        <View style={styles.modelLoadingBadge}>
          <Text style={styles.modelLoadingText}>Loading model…</Text>
        </View>
      )}

      <SafeAreaView style={styles.safeArea}>

        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <View style={styles.glassPanel}>
            <MaterialIcons name="verified-user" size={20} color={session ? '#34d399' : '#94a3b8'} />
            <View style={styles.statusTextContainer}>
              <Text style={styles.statusTitle}>Vigilane Active</Text>
              <Text style={styles.statusSubtitle}>{session ? 'SESSION LIVE' : 'CONNECTING…'}</Text>
            </View>
          </View>

          <View style={[styles.glassPanel, styles.recPanel]}>
            <Animated.View style={[styles.pulsingDot, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={styles.recText}>REC {formatElapsed(elapsedSeconds)}</Text>
          </View>
        </View>

        {/* ── AR bounding-box overlays — drawn from live detections ── */}
        {showAlert && latestHazard && latestHazard.bboxes.length > 0 && (
          <View style={styles.arLayer}>
            {latestHazard.bboxes.map((bbox, i) => (
              <View
                key={i}
                style={[
                  styles.arBox,
                  {
                    // Bboxes are normalised [0, 1]; percentage strings map
                    // them onto the full-screen container dimensions.
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
                <Text style={styles.arConfidence}>
                  {Math.round(latestHazard.confidence * 100)}%
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.flexSpacer} />

        {/* ── Bottom dashboard ── */}
        <View style={styles.bottomOverlay}>

          {/* Alert banner — existing bounce animation wired to lastAlert */}
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
            {/* Speed widget — placeholder; wire to GPS in a future milestone */}
            <View style={styles.speedWidget}>
              <Text style={styles.speedNumber}>65</Text>
              <Text style={styles.speedUnit}>MPH</Text>
            </View>

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
