import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getHazard } from '../../services/api';
import { Hazard } from '../../types';

export default function HazardEventDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [hazard, setHazard] = useState<Hazard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    getHazard(id)
      .then(setHazard)
      .catch(() => setError('Failed to load hazard details.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1973f0" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !hazard) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? 'Hazard not found.'}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const confidencePct = `${Math.round(hazard.confidence * 100)}%`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back-ios" size={20} color="#0f172a" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {hazard.type.charAt(0).toUpperCase() + hazard.type.slice(1)} Detected
        </Text>
        <TouchableOpacity style={styles.editButton}>
          <Text style={styles.editText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>

        {/* Video Section */}
        <View style={styles.section}>
          <View style={styles.videoContainer}>
            <ImageBackground
              source={{ uri: hazard.thumbnailUrl }}
              style={styles.videoThumbnail}
            >
              <View style={styles.videoOverlay} />
              <TouchableOpacity style={styles.playButton}>
                <MaterialIcons name="play-arrow" size={36} color="#ffffff" />
              </TouchableOpacity>
              <View style={styles.videoControls}>
                <View style={styles.timeRow}>
                  <Text style={styles.timeText}>00:00</Text>
                  <Text style={styles.timeText}>00:10</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={styles.progressBarFill} />
                </View>
              </View>
              <View style={styles.timestampBadge}>
                <Text style={styles.timestampText}>{hazard.createdAt}</Text>
              </View>
            </ImageBackground>
          </View>
        </View>

        {/* Location Section */}
        <View style={styles.section}>
          <View style={styles.locationHeader}>
            <Text style={styles.sectionTitle}>LOCATION</Text>
            <TouchableOpacity style={styles.openMapsBtn}>
              <Text style={styles.openMapsText}>Open Maps</Text>
              <MaterialIcons name="open-in-new" size={14} color="#1973f0" />
            </TouchableOpacity>
          </View>
          <View style={styles.mapContainer}>
            <ImageBackground
              source={{ uri: 'https://via.placeholder.com/600x250/e2e8f0/64748b?text=Map+View' }}
              style={styles.mapBackground}
            >
              <View style={styles.mapPinContainer}>
                <View style={styles.mapPinOuter}>
                  <View style={styles.mapPinInner} />
                </View>
              </View>
              <View style={styles.coordBadge}>
                <MaterialIcons name="location-on" size={16} color="#1973f0" />
                <Text style={styles.coordText}>
                  {hazard.latitude.toFixed(4)}° N, {Math.abs(hazard.longitude).toFixed(4)}° W
                </Text>
              </View>
            </ImageBackground>
          </View>
        </View>

        {/* Hazard Metrics Grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitleDark}>Hazard Metrics</Text>
          <View style={styles.grid}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialIcons name="warning" size={18} color="#64748b" />
                <Text style={styles.cardHeaderText}>TYPE</Text>
              </View>
              <Text style={styles.cardValue}>
                {hazard.type.charAt(0).toUpperCase() + hazard.type.slice(1)}
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialIcons name="verified-user" size={18} color="#64748b" />
                <Text style={styles.cardHeaderText}>CONFIDENCE</Text>
              </View>
              <View style={styles.valueRow}>
                <Text style={styles.cardValue}>{confidencePct}</Text>
                <View style={styles.tagHigh}>
                  <Text style={styles.tagHighText}>
                    {hazard.confidence >= 0.8 ? 'High' : hazard.confidence >= 0.5 ? 'Med' : 'Low'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialIcons name="speed" size={18} color="#64748b" />
                <Text style={styles.cardHeaderText}>VEHICLE SPEED</Text>
              </View>
              <Text style={styles.cardValue}>
                {hazard.vehicleSpeed} <Text style={styles.cardValueUnit}>mph</Text>
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialIcons name="vibration" size={18} color="#64748b" />
                <Text style={styles.cardHeaderText}>G-FORCE</Text>
              </View>
              <Text style={styles.cardValue}>{hazard.gForce}g</Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.primaryButton}>
            <MaterialIcons name="share" size={20} color="#ffffff" />
            <Text style={styles.primaryButtonText}>Share Clip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton}>
            <MaterialIcons name="delete" size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>

        {/* Activity Log */}
        <View style={styles.section}>
          <Text style={styles.sectionTitleDark}>Activity Log</Text>
          <View style={styles.timeline}>
            {hazard.activityLog.map((entry, i) => (
              <View
                key={i}
                style={[styles.timelineItem, i === hazard.activityLog.length - 1 && styles.timelineItemLast]}
              >
                <View style={[styles.timelineDot, i === 0 ? styles.timelineDotPrimary : styles.timelineDotGray]} />
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTime}>{entry.time}</Text>
                  <Text style={styles.timelineTitle}>{entry.title}</Text>
                  {entry.sub ? <Text style={styles.timelineSub}>{entry.sub}</Text> : null}
                </View>
              </View>
            ))}
            <View style={styles.timelineLine} />
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f6f7f8' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#64748b', fontSize: 14, marginBottom: 16, textAlign: 'center' },
  backBtn: {
    backgroundColor: '#1973f0',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backBtnText: { color: '#fff', fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f6f7f8',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  editButton: { width: 40, alignItems: 'flex-end', justifyContent: 'center' },
  editText: { color: '#1973f0', fontSize: 16, fontWeight: '600' },
  container: { flex: 1 },
  contentContainer: { paddingBottom: 40 },
  section: { paddingHorizontal: 16, paddingTop: 16 },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  videoThumbnail: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  videoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(25, 115, 240, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  videoControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    paddingTop: 24,
  },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  timeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  progressBarBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: { width: '33%', height: '100%', backgroundColor: '#1973f0' },
  timestampBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  timestampText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  locationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: '#64748b', letterSpacing: 0.5 },
  sectionTitleDark: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  openMapsBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  openMapsText: { color: '#1973f0', fontSize: 12, fontWeight: '600' },
  mapContainer: {
    width: '100%',
    aspectRatio: 21 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  mapBackground: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapPinContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -8 }, { translateY: -8 }],
  },
  mapPinOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(25, 115, 240, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPinInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1973f0',
    borderWidth: 2,
    borderColor: '#fff',
  },
  coordBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  coordText: { fontSize: 10, fontWeight: '600', color: '#0f172a' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: {
    width: '48%',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  cardHeaderText: { fontSize: 10, fontWeight: '600', color: '#64748b' },
  cardValue: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  cardValueUnit: { fontSize: 14, fontWeight: '400', color: '#64748b' },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tagHigh: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagHighText: { color: '#16a34a', fontSize: 10, fontWeight: '600' },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#1973f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    width: 52,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  timeline: { paddingLeft: 8, marginTop: 8 },
  timelineLine: {
    position: 'absolute',
    left: 15,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#e2e8f0',
    zIndex: -1,
  },
  timelineItem: { flexDirection: 'row', marginBottom: 24 },
  timelineItemLast: { marginBottom: 0 },
  timelineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 4,
    borderColor: '#f6f7f8',
    marginTop: 2,
  },
  timelineDotPrimary: { backgroundColor: '#1973f0' },
  timelineDotGray: { backgroundColor: '#cbd5e1' },
  timelineContent: { flex: 1, marginLeft: 16 },
  timelineTime: { fontSize: 10, color: '#64748b', marginBottom: 2 },
  timelineTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  timelineSub: { fontSize: 12, color: '#64748b', marginTop: 4 },
});
