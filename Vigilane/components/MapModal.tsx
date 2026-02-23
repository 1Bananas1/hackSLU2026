/**
 * MapModal.tsx
 *
 * Full-screen map overlay showing the user's current location and all
 * reported hazard pins.  Open it by setting `visible={true}`.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, type Region } from 'react-native-maps';
import { MaterialIcons } from '@expo/vector-icons';
import { getUserHazards } from '@/services/firestore';
import type { Hazard } from '@/types';

interface LatLng {
  lat: number;
  lng: number;
}

interface MapModalProps {
  visible: boolean;
  onClose: () => void;
  /** Current GPS position of the device (may be null if permission denied). */
  currentLocation: LatLng | null;
}

// ── Marker color by label ────────────────────────────────────────────────────
function pinColor(labels: string[]): string {
  const label = labels[0] ?? '';
  if (label === 'pothole') return '#f59e0b';
  if (label === 'accident') return '#ef4444';
  if (label === 'debris') return '#8b5cf6';
  if (label === 'manual') return '#1973f0';
  return '#64748b';
}

function labelTitle(labels: string[]): string {
  const l = labels[0] ?? 'hazard';
  return l.charAt(0).toUpperCase() + l.slice(1);
}

// ── Component ────────────────────────────────────────────────────────────────

const DEFAULT_REGION: Region = {
  latitude: 38.6270,   // St. Louis, MO — reasonable default
  longitude: -90.1994,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const DELTA = { latitudeDelta: 0.02, longitudeDelta: 0.02 };

export default function MapModal({ visible, onClose, currentLocation }: MapModalProps) {
  const mapRef = useRef<MapView>(null);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch hazards every time the modal opens
  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    getUserHazards()
      .then(setHazards)
      .catch((e) => console.warn('[MapModal] fetch hazards failed:', e))
      .finally(() => setLoading(false));
  }, [visible]);

  // Centre map on user when location becomes available
  useEffect(() => {
    if (!visible || !currentLocation) return;
    mapRef.current?.animateToRegion(
      { latitude: currentLocation.lat, longitude: currentLocation.lng, ...DELTA },
      600,
    );
  }, [visible, currentLocation]);

  const initialRegion: Region = currentLocation
    ? { latitude: currentLocation.lat, longitude: currentLocation.lng, ...DELTA }
    : DEFAULT_REGION;

  // Hazards that have GPS coords
  const mappable = hazards.filter((h) => h.location?.lat && h.location?.lng);

  const handleRecenter = () => {
    if (!currentLocation) return;
    mapRef.current?.animateToRegion(
      { latitude: currentLocation.lat, longitude: currentLocation.lng, ...DELTA },
      500,
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {/* ── Map ── */}
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={initialRegion}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {/* Hazard markers */}
          {mappable.map((h) => (
            <Marker
              key={h.id}
              coordinate={{ latitude: h.location!.lat, longitude: h.location!.lng }}
              title={labelTitle(h.labels)}
              description={`${Math.round(h.confidence * 100)}% confidence • ${new Date(h.timestamp).toLocaleString()}`}
              pinColor={pinColor(h.labels)}
            />
          ))}
        </MapView>

        {/* ── Header overlay ── */}
        <View style={styles.header} pointerEvents="box-none">
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.85}>
            <MaterialIcons name="close" size={22} color="#fff" />
          </TouchableOpacity>

          <View style={styles.titlePill}>
            <MaterialIcons name="map" size={16} color="#fff" />
            <Text style={styles.titleText}>Hazard Map</Text>
          </View>

          {/* Recenter */}
          <TouchableOpacity
            style={[styles.closeBtn, !currentLocation && styles.btnDisabled]}
            onPress={handleRecenter}
            activeOpacity={0.85}
            disabled={!currentLocation}
          >
            <MaterialIcons name="my-location" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ── Loading indicator ── */}
        {loading && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="small" color="#fff" />
          </View>
        )}

        {/* ── Pin count badge ── */}
        {!loading && (
          <View style={styles.countBadge} pointerEvents="none">
            <MaterialIcons name="location-on" size={14} color="#f59e0b" />
            <Text style={styles.countText}>
              {mappable.length} {mappable.length === 1 ? 'hazard' : 'hazards'} mapped
            </Text>
          </View>
        )}

        {/* ── Legend ── */}
        <View style={styles.legend} pointerEvents="none">
          {[
            { color: '#f59e0b', label: 'Pothole' },
            { color: '#ef4444', label: 'Accident' },
            { color: '#8b5cf6', label: 'Debris' },
            { color: '#1973f0', label: 'Manual' },
          ].map(({ color, label }) => (
            <View key={label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendText}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },

  // ── Header ──
  header: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 36,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15,23,42,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  btnDisabled: { opacity: 0.4 },
  titlePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15,23,42,0.8)',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  titleText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // ── Loading ──
  loadingOverlay: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 90,
    alignSelf: 'center',
    backgroundColor: 'rgba(15,23,42,0.7)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },

  // ── Count badge ──
  countBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 90,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15,23,42,0.75)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  countText: { color: '#e2e8f0', fontSize: 12, fontWeight: '600' },

  // ── Legend ──
  legend: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 44 : 24,
    left: 16,
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(15,23,42,0.8)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: '#cbd5e1', fontSize: 11, fontWeight: '600' },
});
