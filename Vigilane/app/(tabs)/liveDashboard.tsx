import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  Animated,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused } from "@react-navigation/native";
import { usePotholeDetector } from "@/hooks/usePotholeDetector";
import { writeHazard, getUserSettings } from "@/services/firestore";
import { createSession, endSession, createHazard } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import type { Hazard } from "@/types";
import { Toast, useToast } from "@/components/toast";

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function mphFromMetersPerSecond(mps: number): number {
  return mps * 2.2369362920544;
}

export default function VigilaneLiveDashboard() {
  const { user } = useAuth();
  const isFocused = useIsFocused();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  // ── Button morph animation ─────────────────────────────────────────────────
  // widthAnim / colorAnim: JS-thread (layout props); nativeAnim: native thread
  const BUTTON_FULL_WIDTH = Dimensions.get("window").width - 32; // bottomOverlay paddingH×2
  const BUTTON_SIZE = 64;
  const LIFT_AMOUNT = BUTTON_SIZE + 12; // circle clears report button by 12px gap
  const widthAnim = useRef(new Animated.Value(BUTTON_FULL_WIDTH)).current;
  const colorAnim = useRef(new Animated.Value(0)).current;  // 0 = green, 1 = red
  const nativeAnim = useRef(new Animated.Value(0)).current; // 0 = stopped, 1 = recording

  // Derived values — kept as stable references (not re-created each render)
  const buttonBgColor = useRef(
    colorAnim.interpolate({ inputRange: [0, 1], outputRange: ["#16a34a", "#dc2626"] }),
  ).current;
  const startContentOpacity = useRef(
    colorAnim.interpolate({ inputRange: [0, 0.3], outputRange: [1, 0], extrapolate: "clamp" }),
  ).current;
  const stopContentOpacity = useRef(
    colorAnim.interpolate({ inputRange: [0.5, 1], outputRange: [0, 1], extrapolate: "clamp" }),
  ).current;
  const stopTranslateY = useRef(
    nativeAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -LIFT_AMOUNT] }),
  ).current;
  const reportOpacity = nativeAnim;
  const reportTranslateY = useRef(
    nativeAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
  ).current;

  const [isRecording, setIsRecording] = useState(false);
  const [latestHazard, setLatestHazard] = useState<Hazard | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [reporting, setReporting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  // ── Alert volume / confidence threshold ───────────────────────────────────
  // Reload from Firestore whenever the screen comes into focus so that a
  // slider change in Settings takes effect immediately on return.
  const [alertVolume, setAlertVolume] = useState(100);
  const [audioAlertsEnabled, setAudioAlertsEnabled] = useState(true);
  // Keep a ref so the lastAlert effect always reads the live value without
  // needing to be in that effect's dependency array (which would re-fire
  // writeHazard every time the user changes the audio toggle in Settings).
  const audioAlertsEnabledRef = useRef(true);
  useEffect(() => {
    audioAlertsEnabledRef.current = audioAlertsEnabled;
  }, [audioAlertsEnabled]);

  useEffect(() => {
    if (!user || !isFocused) return;
    getUserSettings(user.uid).then((s) => {
      setAlertVolume(s.alertVolume ?? 100);
      setAudioAlertsEnabled(s.audioAlertsEnabled ?? true);
    });
  }, [user, isFocused]);

  // volume === 0  →  silent mode  →  raise threshold to 0.99 (≈ disabled)
  // volume  > 0  →  normal mode  →  default threshold 0.12
  const confidenceThreshold = alertVolume === 0 ? 0.99 : 0.12;

  // ── Camera ────────────────────────────────────────────────────────────────
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const { frameProcessor, lastAlert, modelState } = usePotholeDetector(confidenceThreshold);

  // ── Speed (GPS) ───────────────────────────────────────────────────────────
  const [speedMps, setSpeedMps] = useState<number | null>(null);
  const speedLabel = useMemo(() => {
    if (speedMps == null || speedMps < 0) return "—";
    return `${Math.round(mphFromMetersPerSecond(speedMps))} mph`;
  }, [speedMps]);

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
        if (status !== "granted") {
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
            setSpeedMps(typeof s === "number" ? s : null);
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
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: -8,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulseAnim, bounceAnim]);

  // Stop speech whenever the screen loses focus (tab switch / background).
  useEffect(() => {
    if (!isFocused) Speech.stop();
  }, [isFocused]);

  // Recording timer — only ticks while recording is active
  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isRecording]);

  const getDeviceId = async (): Promise<string> => {
    const existing = await AsyncStorage.getItem("device_id");
    if (existing) return existing;
    const created = `mobile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await AsyncStorage.setItem("device_id", created);
    return created;
  };

  const runMorphAnim = (toRecording: boolean) => {
    const toVal = toRecording ? 1 : 0;
    const toWidth = toRecording ? BUTTON_SIZE : BUTTON_FULL_WIDTH;
    Animated.parallel([
      Animated.timing(widthAnim, { toValue: toWidth, duration: 320, useNativeDriver: false }),
      Animated.timing(colorAnim, { toValue: toVal, duration: 320, useNativeDriver: false }),
      Animated.timing(nativeAnim, { toValue: toVal, duration: 320, useNativeDriver: true }),
    ]).start();
  };

  const handleToggleSession = async () => {
    if (isRecording) {
      runMorphAnim(false); // immediate visual feedback
      try {
        if (sessionId) {
          await endSession(sessionId);
        }
      } catch (err) {
        console.error("End session failed:", err);
        showToast("Failed to end session", "error");
      } finally {
        setIsRecording(false);
        setSessionId(null);
        setLatestHazard(null);
        setElapsedSeconds(0);
        showToast("Recording stopped", "info");
      }
      return;
    }

    runMorphAnim(true); // immediate visual feedback
    try {
      const deviceId = await getDeviceId();
      const session = await createSession(deviceId);
      setSessionId(session.id);
      setIsRecording(true);
      showToast("Recording started", "success");
    } catch (err) {
      runMorphAnim(false); // revert on failure
      console.error("Start session failed:", err);
      showToast("Failed to start session", "error");
    }
  };

  // ── On-device detection handler ───────────────────────────────────────────
  useEffect(() => {
    if (!lastAlert || !isRecording || !sessionId) return;

    const localHazard: Hazard = {
      id: `local-${lastAlert.timestamp}`,
      user_uid: "", // local-only placeholder; real uid written inside writeHazard
      event_type: lastAlert.labels[0] ?? "pothole",
      confidence: lastAlert.confidence,
      labels: lastAlert.labels,
      bboxes: lastAlert.bboxes,
      frame_number: 0,
      timestamp: new Date(lastAlert.timestamp).toISOString(),
      status: "pending",
    };

    setLatestHazard(localHazard);

    void writeHazard(sessionId, {
      confidence: lastAlert.confidence,
      bboxes: lastAlert.bboxes,
      labels: lastAlert.labels,
      frameNumber: 0,
      user_uid: user?.uid,
    });

    // ── Voice alert on the phone ──────────────────────────────────────────
    // alertVolume === 0 already raises confidenceThreshold to 0.99, so by
    // the time lastAlert fires we know the user hasn't silenced the app.
    // We only skip the speech if the Audio Alerts toggle is off.
    if (audioAlertsEnabledRef.current) {
      const label = lastAlert.labels[0] ?? "hazard";
      Speech.stop(); // cancel any still-speaking previous alert
      Speech.speak(`${label} detected`, { rate: 1.1 });
    }

    const clearTimer = setTimeout(() => setLatestHazard(null), 5_000);
    return () => clearTimeout(clearTimer);
  }, [lastAlert, isRecording, sessionId]);

  // ── Manual report button ──────────────────────────────────────────────────
  const handleReportHazard = async () => {
    if (reporting) return;
    if (!sessionId) {
      showToast("Start recording to create a session first", "error");
      return;
    }
    setReporting(true);
    try {
      const newHazard = await createHazard({
        session_id: sessionId,
        confidence: 1.0,
        labels: ["manual"],
        bboxes: [],
        frame_number: 0,
      });
      setLatestHazard(newHazard);
      showToast("Hazard reported!", "success");
    } catch (err) {
      console.error("Report hazard failed:", err);
      showToast("Failed to report hazard", "error");
    } finally {
      setReporting(false);
    }
  };

  const showAlert =
    latestHazard != null &&
    (() => {
      const ageMs = Date.now() - new Date(latestHazard.timestamp).getTime();
      return ageMs < 5_000;
    })();

  const alertLabel =
    showAlert && latestHazard
      ? `${(latestHazard.labels[0] ?? "hazard").charAt(0).toUpperCase() + (latestHazard.labels[0] ?? "hazard").slice(1)} detected • ${Math.round(latestHazard.confidence * 100)}% confidence`
      : null;

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />
      <Toast {...toast} />

      {hasPermission && device != null ? (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isFocused}
          frameProcessor={frameProcessor}
          pixelFormat={Platform.OS === "ios" ? "rgb" : "yuv"}
        />
      ) : (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: "#0a1628" }]}
        />
      )}

      <View style={styles.overlay} />

      {modelState === "loading" && (
        <View style={styles.modelLoadingBadge}>
          <Text style={styles.modelLoadingText}>Loading model…</Text>
        </View>
      )}

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          {/* Left — Vigilane wordmark */}
          <View style={styles.glassPanel}>
            <Text style={styles.statusTitle}>Vigilane</Text>
          </View>

          {/* Center — live speed */}
          <View style={[styles.glassPanel, styles.recPanel]}>
            <MaterialIcons name="speed" size={16} color="#e2e8f0" />
            <Text style={styles.speedText}>{speedLabel}</Text>
          </View>

          {/* Right — REC timer / STANDBY */}
          <View style={[styles.glassPanel, styles.recPanel]}>
            {isRecording ? (
              <>
                <Animated.View
                  style={[
                    styles.pulsingDot,
                    { transform: [{ scale: pulseAnim }] },
                  ]}
                />
                <Text style={styles.recText}>
                  REC {formatElapsed(elapsedSeconds)}
                </Text>
              </>
            ) : (
              <Text style={styles.recText}>STANDBY</Text>
            )}
          </View>
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
                    width:
                      `${((bbox.x2 - bbox.x1) * 100).toFixed(1)}%` as unknown as number,
                    height:
                      `${((bbox.y2 - bbox.y1) * 100).toFixed(1)}%` as unknown as number,
                  },
                ]}
              >
                <View style={styles.arBadge}>
                  <MaterialIcons name="warning" size={12} color="#000" />
                  <Text style={styles.arBadgeText}>
                    {(
                      latestHazard.labels[i] ??
                      latestHazard.labels[0] ??
                      ""
                    ).toUpperCase()}
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

        <View style={styles.bottomOverlay}>
          {alertLabel && (
            <Animated.View
              style={[
                styles.alertBannerContainer,
                { transform: [{ translateY: bounceAnim }] },
              ]}
            >
              <View style={styles.alertBanner}>
                <MaterialIcons
                  name="report-problem"
                  size={28}
                  color="#0f172a"
                />
                <View style={styles.alertTextContainer}>
                  <Text style={styles.alertTitle}>Hazard Detected</Text>
                  <Text style={styles.alertSubtitle}>{alertLabel}</Text>
                </View>
              </View>
            </Animated.View>
          )}

          {/* ── Morphing button area ─────────────────────────────────── */}
          <View style={styles.buttonArea}>
            {/* Report Hazard — fades up into view when recording starts */}
            <Animated.View
              style={[
                styles.reportBtnWrapper,
                {
                  opacity: reportOpacity,
                  transform: [{ translateY: reportTranslateY }],
                },
              ]}
              pointerEvents={isRecording ? "auto" : "none"}
            >
              <TouchableOpacity
                style={[
                  styles.reportButton,
                  reporting && styles.reportButtonDisabled,
                ]}
                activeOpacity={0.8}
                onPress={handleReportHazard}
                disabled={reporting}
              >
                <MaterialIcons name="add-alert" size={28} color="#fff" />
                <Text style={styles.reportButtonText}>
                  {reporting ? "Reporting…" : "Report Hazard"}
                </Text>
              </TouchableOpacity>
            </Animated.View>

            {/* Start/Stop — morphs width (wide→circle) and color (green→red),
                slides up to float above the Report Hazard button */}
            <Animated.View
              style={[
                styles.sessionBtnOuter,
                { transform: [{ translateY: stopTranslateY }] },
              ]}
            >
              <Animated.View
                style={[
                  styles.sessionBtnInner,
                  { width: widthAnim, backgroundColor: buttonBgColor },
                ]}
              >
                <TouchableOpacity
                  style={styles.sessionBtnTouch}
                  activeOpacity={0.8}
                  onPress={handleToggleSession}
                >
                  {/* Start content — fades out as button shrinks */}
                  <Animated.View
                    style={[styles.sessionContent, { opacity: startContentOpacity }]}
                  >
                    <MaterialIcons name="play-circle-filled" size={28} color="#fff" />
                    <Text style={styles.reportButtonText}>Start Session</Text>
                  </Animated.View>

                  {/* Stop content — fades in once button is near-circle */}
                  <Animated.View
                    style={[
                      styles.sessionContent,
                      styles.stopContent,
                      StyleSheet.absoluteFill,
                      { opacity: stopContentOpacity },
                    ]}
                  >
                    <MaterialIcons name="stop" size={26} color="#fff" />
                    <Text style={styles.stopText}>Stop</Text>
                  </Animated.View>
                </TouchableOpacity>
              </Animated.View>
            </Animated.View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  safeArea: { flex: 1 },
  modelLoadingBadge: {
    position: "absolute",
    top: 60,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    zIndex: 30,
  },
  modelLoadingText: { color: "#94a3b8", fontSize: 12, fontWeight: "600" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    zIndex: 20,
  },
  glassPanel: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 24, 34, 0.7)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    gap: 8,
  },
  statusTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
  recPanel: { gap: 6 },
  pulsingDot: {
    width: 12,
    height: 12,
    backgroundColor: "#ef4444",
    borderRadius: 6,
  },
  recText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "monospace",
    letterSpacing: 1,
  },

  speedText: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "monospace",
  },

  arLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    pointerEvents: "none",
  },
  arBox: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "rgba(245, 158, 11, 0.8)",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderRadius: 8,
    justifyContent: "space-between",
  },
  arBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f59e0b",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderTopLeftRadius: 6,
    borderBottomRightRadius: 8,
    gap: 4,
  },
  arBadgeText: { color: "#000", fontSize: 10, fontWeight: "700" },
  arConfidence: {
    color: "#f59e0b",
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "700",
    alignSelf: "flex-end",
    paddingRight: 6,
    paddingBottom: 4,
  },
  flexSpacer: { flex: 1 },
  bottomOverlay: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 16,
    zIndex: 20,
  },
  alertBannerContainer: { alignItems: "center", width: "100%" },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(245, 158, 11, 0.95)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.5)",
    gap: 12,
    width: "100%",
    maxWidth: 400,
  },
  alertTextContainer: { flex: 1 },
  alertTitle: { color: "#0f172a", fontSize: 14, fontWeight: "700" },
  alertSubtitle: { color: "#334155", fontSize: 12, fontWeight: "600" },
  // ── Morphing button area ──────────────────────────────────────────────────
  buttonArea: {
    height: 64,
    marginBottom: 16,
    // overflow is 'visible' by default in RN — the floating circle can extend above
  },
  reportBtnWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
  },
  reportButton: {
    flex: 1,
    height: 64,
    backgroundColor: "#1973f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 32,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    shadowColor: "#1973f0",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  reportButtonDisabled: { opacity: 0.5 },
  reportButtonText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  sessionBtnOuter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    zIndex: 10,
  },
  sessionBtnInner: {
    height: 64,
    borderRadius: 32,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  sessionBtnTouch: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  stopContent: {
    flexDirection: "column",
    gap: 2,
  },
  stopText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
