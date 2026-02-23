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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { deleteHazard } from '../services/api';
import { Hazard } from '../types';
import { Toast, useToast } from '../components/toast';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getConfidenceTag(confidence: number): { label: string; color: string } {
  if (confidence >= 0.8) return { label: 'High',   color: '#16a34a' };
  if (confidence >= 0.5) return { label: 'Medium', color: '#ca8a04' };
  return                         { label: 'Low',    color: '#dc2626' };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HazardEventDetails() {
  const params = useLocalSearchParams<{ id: string }>();
  // useLocalSearchParams can return string | string[] — normalise to string
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const [hazard, setHazard] = useState<Hazard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { toast, showToast } = useToast();

  useEffect(() => {
    if (!id) return;
    // Skip local-only placeholder IDs (not yet in Firestore)
    if (id.startsWith('local-')) {
      setError('This detection is still being saved. Check back in a moment.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // Fetch directly from Firestore by document ID — fast, no API needed
    getDoc(doc(db, 'hazards', id))
      .then((snap) => {
        if (!snap.exists()) {
          setError('Hazard not found.');
          return;
        }
        const data = snap.data();
        const raw = data.timestamp;
        const timestamp =
          raw?.toDate?.()?.toISOString?.() ??
          (typeof raw === 'string' ? raw : new Date().toISOString());
        setHazard({
          id: snap.id,
          user_uid: data.user_uid ?? '',
          event_type: data.labels?.[0] ?? data.event_type ?? 'unknown',
          confidence: data.confidence ?? 0,
          labels: data.labels ?? [],
          bboxes: data.bboxes ?? [],
          frame_number: data.frame_number ?? 0,
          timestamp,
          status: data.status ?? 'pending',
          photo_url: data.photo_url ?? null,
          location: data.location ?? null,
        } as Hazard);
      })
      .catch((err) => {
        console.error('[HazardDetails] Firestore fetch failed:', err);
        setError('Failed to load hazard details.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!id || deleting) return;
    if (!confirmDelete) {
      // First tap: ask for confirmation
      setConfirmDelete(true);
      return;
    }
    // Second tap: actually delete
    setDeleting(true);
    try {
      console.log('[DELETE] Deleting hazard id:', id);
      await deleteHazard(id);
      console.log('[DELETE] Success, navigating back');
      showToast('Hazard deleted', 'success');
      setTimeout(() => router.replace('/(tabs)/hazardHistory'), 900);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[DELETE] Failed:', msg);
      showToast(`Delete failed: ${msg}`, 'error');
      setError(`Delete failed: ${msg}`);
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1973f0" />
        </View>
      </SafeAreaView>
    );
  }

  if (error && !hazard) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.back()}>
            <Text style={styles.actionBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!hazard) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Hazard not found.</Text>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.back()}>
            <Text style={styles.actionBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const primaryLabel = capitalizeFirst(hazard.labels[0] ?? 'Unknown');
  const allLabels = hazard.labels.map(capitalizeFirst).join(', ');
  const confidencePct = `${Math.round(hazard.confidence * 100)}%`;
  const confidenceTag = getConfidenceTag(hazard.confidence);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Toast {...toast} />
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back-ios" size={20} color="#ffffff" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{primaryLabel} Detected</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>

        {/* Photo / Thumbnail */}
        <View style={styles.section}>
          <View style={styles.videoContainer}>
            <ImageBackground
              source={hazard.photo_url ? { uri: hazard.photo_url } : undefined}
              style={[styles.videoThumbnail, !hazard.photo_url && styles.thumbnailPlaceholder]}
            >
              {hazard.photo_url && <View style={styles.videoOverlay} />}
              <View style={styles.timestampBadge}>
                <Text style={styles.timestampText}>{formatTimestamp(hazard.timestamp)}</Text>
              </View>
            </ImageBackground>
          </View>
        </View>

        {/* Location */}
        {hazard.location && (
          <View style={styles.section}>
            <View style={styles.locationHeader}>
              <Text style={styles.sectionTitle}>LOCATION</Text>
              <TouchableOpacity
                style={styles.openMapsBtn}
                onPress={() => {
                  const { lat, lng } = hazard.location!;
                  Linking.openURL(`https://maps.apple.com/?ll=${lat},${lng}&q=Hazard`);
                }}
              >
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
                    {hazard.location.lat.toFixed(4)}° N, {Math.abs(hazard.location.lng).toFixed(4)}° W
                  </Text>
                </View>
              </ImageBackground>
            </View>
          </View>
        )}

        {/* Hazard Metrics Grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitleDark}>Detection Details</Text>
          <View style={styles.grid}>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialIcons name="label" size={18} color="#64748b" />
                <Text style={styles.cardHeaderText}>LABELS</Text>
              </View>
              <Text style={styles.cardValue} numberOfLines={2}>{allLabels}</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialIcons name="verified-user" size={18} color="#64748b" />
                <Text style={styles.cardHeaderText}>CONFIDENCE</Text>
              </View>
              <View style={styles.valueRow}>
                <Text style={styles.cardValue}>{confidencePct}</Text>
                <View style={[styles.tag, { backgroundColor: `${confidenceTag.color}33` }]}>
                  <Text style={[styles.tagText, { color: confidenceTag.color }]}>{confidenceTag.label}</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialIcons name="movie" size={18} color="#64748b" />
                <Text style={styles.cardHeaderText}>FRAME</Text>
              </View>
              <Text style={styles.cardValue}>#{hazard.frame_number}</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialIcons name="info-outline" size={18} color="#64748b" />
                <Text style={styles.cardHeaderText}>STATUS</Text>
              </View>
              <Text style={styles.cardValue}>{capitalizeFirst(hazard.status ?? 'pending')}</Text>
            </View>

          </View>
        </View>

        {/* Bounding Boxes */}
        {hazard.bboxes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitleDark}>Bounding Boxes</Text>
            {hazard.bboxes.map((bbox, i) => (
              <View key={i} style={styles.bboxRow}>
                <Text style={styles.bboxLabel}>Box {i + 1}</Text>
                <Text style={styles.bboxValue}>
                  ({bbox.x1}, {bbox.y1}) → ({bbox.x2}, {bbox.y2})
                </Text>
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      {/* Delete bar — fixed at bottom */}
      <View style={styles.deleteBar}>
        {error ? (
          <Text style={styles.deleteErrorText}>{error}</Text>
        ) : null}
        <TouchableOpacity
          style={[
            styles.deleteBarButton,
            confirmDelete && styles.deleteBarButtonConfirm,
            deleting && { opacity: 0.5 },
          ]}
          onPress={handleDelete}
          disabled={deleting}
        >
          <MaterialIcons name="delete" size={22} color="#fff" />
          <Text style={styles.deleteBarText}>
            {deleting ? 'Deleting…' : confirmDelete ? 'Tap again to confirm' : 'Delete Hazard'}
          </Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#101822' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#94a3b8', fontSize: 14, marginBottom: 16, textAlign: 'center' },
  actionBtn: { backgroundColor: '#1973f0', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  actionBtnText: { color: '#fff', fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#101822',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: '#ffffff' },
  container: { flex: 1, backgroundColor: '#101822' },
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
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  videoThumbnail: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  thumbnailPlaceholder: { backgroundColor: '#1e293b' },
  videoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
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
  locationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: '#94a3b8', letterSpacing: 0.5 },
  sectionTitleDark: { fontSize: 18, fontWeight: '700', color: '#ffffff', marginBottom: 12 },
  openMapsBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  openMapsText: { color: '#1973f0', fontSize: 12, fontWeight: '600' },
  mapContainer: {
    width: '100%',
    aspectRatio: 21 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1e293b',
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
  mapPinInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#1973f0', borderWidth: 2, borderColor: '#fff' },
  coordBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e2936',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 6,
  },
  coordText: { fontSize: 10, fontWeight: '600', color: '#ffffff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: {
    width: '48%',
    backgroundColor: '#1e2936',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  cardHeaderText: { fontSize: 10, fontWeight: '600', color: '#94a3b8' },
  cardValue: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagText: { fontSize: 10, fontWeight: '600' },
  bboxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  bboxLabel: { fontSize: 13, fontWeight: '600', color: '#ffffff' },
  bboxValue: { fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' },
  deleteBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    backgroundColor: '#101822',
  },
  deleteErrorText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 8,
  },
  deleteBarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  deleteBarButtonConfirm: {
    backgroundColor: '#b91c1c',
  },
  deleteBarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
