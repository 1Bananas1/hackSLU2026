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
import { getLiveDetection, reportHazard } from '../../services/api';
import { LiveDetection } from '../../types';

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

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [detection, setDetection] = useState<LiveDetection | null>(null);
  const [reporting, setReporting] = useState(false);

  // Pulsing dot + bounce animations
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

  // Recording timer
  useEffect(() => {
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Live detection polling
  const pollDetection = useCallback(async () => {
    try {
      const data = await getLiveDetection();
      setDetection(data);
    } catch {
      // Silently ignore poll failures — don't interrupt the UI
    }
  }, []);

  useEffect(() => {
    pollDetection();
    const interval = setInterval(pollDetection, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pollDetection]);

  const handleReportHazard = async () => {
    if (reporting) return;
    setReporting(true);
    try {
      await reportHazard({
        type: detection?.hazardType ?? 'unknown',
        location: 'Current location',
        latitude: 0,
        longitude: 0,
        vehicleSpeed: 0,
        gForce: 0,
      });
    } catch {
      // TODO: show toast on error
    } finally {
      setReporting(false);
    }
  };

  const alertLabel = detection?.isActive
    ? `${detection.hazardType.charAt(0).toUpperCase() + detection.hazardType.slice(1)} on ${detection.lane} • ${detection.distanceFt}ft`
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
            <MaterialIcons name="verified-user" size={20} color="#34d399" />
            <View style={styles.statusTextContainer}>
              <Text style={styles.statusTitle}>Vigilane Active</Text>
              <Text style={styles.statusSubtitle}>SYSTEM ONLINE</Text>
            </View>
          </View>

          <View style={[styles.glassPanel, styles.recPanel]}>
            <Animated.View style={[styles.pulsingDot, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={styles.recText}>REC {formatElapsed(elapsedSeconds)}</Text>
          </View>
        </View>

        {/* AR Detection Layer */}
        {detection?.isActive && (
          <View style={styles.arLayer}>
            <View style={[styles.arBox, { top: '40%', left: '30%' }]}>
              <View style={styles.arBadge}>
                <MaterialIcons name="warning" size={12} color="#000" />
                <Text style={styles.arBadgeText}>{detection.hazardType.toUpperCase()}</Text>
              </View>
              <Text style={styles.arDistance}>{detection.distanceFt}ft</Text>
            </View>
          </View>
        )}

        <View style={styles.flexSpacer} />

        {/* Bottom Dashboard */}
        <View style={styles.bottomOverlay}>

          {/* Alert Banner — only shown when detection is active */}
          {alertLabel && (
            <Animated.View style={[styles.alertBannerContainer, { transform: [{ translateY: bounceAnim }] }]}>
              <View style={styles.alertBanner}>
                <MaterialIcons name="report-problem" size={28} color="#0f172a" />
                <View style={styles.alertTextContainer}>
                  <Text style={styles.alertTitle}>Hazard Detected Ahead</Text>
                  <Text style={styles.alertSubtitle}>{alertLabel}</Text>
                </View>
              </View>
            </Animated.View>
          )}

          <View style={styles.dashGrid}>
            <View style={styles.speedWidget}>
              <Text style={styles.speedNumber}>65</Text>
              <Text style={styles.speedUnit}>MPH</Text>
            </View>

            <TouchableOpacity
              style={[styles.reportButton, reporting && styles.reportButtonDisabled]}
              activeOpacity={0.8}
              onPress={handleReportHazard}
              disabled={reporting}
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
  arDistance: {
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
  reportButtonDisabled: { opacity: 0.6 },
  reportButtonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
