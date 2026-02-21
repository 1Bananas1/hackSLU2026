import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ImageBackground,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { getHazards } from '../../services/api';
import { Hazard } from '../../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILTERS = ['All', 'Potholes', 'Accidents', 'Debris', 'Reported'] as const;
type Filter = typeof FILTERS[number];

const colors = {
  background: '#101822',
  surface: '#1e2936',
  primary: '#1973f0',
  textPrimary: '#ffffff',
  textSecondary: '#94a3b8',
  border: '#1e293b',
};

// ---------------------------------------------------------------------------
// Helpers — derive display values from Firestore fields
// ---------------------------------------------------------------------------

function getLabelMeta(labels: string[]): { icon: string; iconBg: string } {
  const label = labels[0] ?? '';
  switch (label) {
    case 'pothole':    return { icon: 'grid-on',     iconBg: '#f97316' };
    case 'crack':      return { icon: 'grid-on',     iconBg: '#f97316' };
    case 'accident':   return { icon: 'car-crash',   iconBg: '#ef4444' };
    case 'debris':     return { icon: 'warning',     iconBg: '#64748b' };
    case 'construction': return { icon: 'construction', iconBg: '#3b82f6' };
    default:           return { icon: 'report-problem', iconBg: '#94a3b8' };
  }
}

function getDateGroup(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getStatusStyle(status?: string) {
  switch (status) {
    case 'reported':
      return { bg: 'rgba(34, 197, 94, 0.1)', text: '#4ade80', dot: '#22c55e', border: 'rgba(34, 197, 94, 0.2)' };
    case 'pending':
      return { bg: 'rgba(234, 179, 8, 0.1)', text: '#facc15', dot: '#eab308', border: 'rgba(234, 179, 8, 0.2)' };
    case 'dismissed':
      return { bg: 'rgba(100, 116, 139, 0.3)', text: '#94a3b8', dot: '#94a3b8', border: 'rgba(100, 116, 139, 0.4)' };
    default:
      return { bg: 'rgba(100, 116, 139, 0.3)', text: '#94a3b8', dot: '#94a3b8', border: 'rgba(100, 116, 139, 0.4)' };
  }
}

function matchesFilter(hazard: Hazard, filter: Filter): boolean {
  if (filter === 'All') return true;
  if (filter === 'Reported') return hazard.status === 'reported';
  const labelMap: Record<string, string> = {
    Potholes: 'pothole',
    Accidents: 'accident',
    Debris: 'debris',
  };
  const target = labelMap[filter];
  return target ? hazard.labels.includes(target) : true;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReportHistory() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<Filter>('All');
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHazards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getHazards();
      setHazards(data);
    } catch {
      setError('Failed to load hazards. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch every time screen gains focus (e.g. after deleting a hazard)
  useFocusEffect(
    useCallback(() => {
      fetchHazards();
    }, [fetchHazards])
  );

  const filteredHazards = useMemo(
    () => hazards.filter((h) => matchesFilter(h, activeFilter)),
    [hazards, activeFilter],
  );

  const renderItem = ({ item, index }: { item: Hazard; index: number }) => {
    const showHeader =
      index === 0 ||
      getDateGroup(filteredHazards[index - 1].timestamp) !== getDateGroup(item.timestamp);
    const statusStyle = getStatusStyle(item.status);
    const { icon, iconBg } = getLabelMeta(item.labels);
    const label = (item.labels[0] ?? 'unknown').charAt(0).toUpperCase() + (item.labels[0] ?? 'unknown').slice(1);

    return (
      <View>
        {showHeader && (
          <Text style={styles.dateHeader}>{getDateGroup(item.timestamp).toUpperCase()}</Text>
        )}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.8}
          onPress={() => router.push({ pathname: '/hazardDetails', params: { id: item.id } })}
        >
          <View style={styles.thumbnailContainer}>
            <ImageBackground
              source={item.photo_url ? { uri: item.photo_url } : undefined}
              style={[styles.thumbnailImage, !item.photo_url && styles.thumbnailPlaceholder]}
              imageStyle={{ borderRadius: 8 }}
            >
              <View style={[styles.iconOverlay, { backgroundColor: iconBg }]}>
                <MaterialIcons name={icon as any} size={14} color="#fff" />
              </View>
            </ImageBackground>
          </View>

          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>{label}</Text>
              <Text style={styles.cardTime}>{formatTime(item.timestamp)}</Text>
            </View>
            <Text style={styles.cardDescription} numberOfLines={1}>
              {`${Math.round(item.confidence * 100)}% confidence • Frame ${item.frame_number}`}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
              <View style={[styles.statusDot, { backgroundColor: statusStyle.dot }]} />
              <Text style={[styles.statusText, { color: statusStyle.text }]}>
                {(item.status ?? 'pending').charAt(0).toUpperCase() + (item.status ?? 'pending').slice(1)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Report History</Text>
      </View>

      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
          placeholder="Search hazards..."
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContainer}
        >
          {FILTERS.map((filter) => {
            const isActive = activeFilter === filter;
            return (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterChip,
                  isActive
                    ? styles.filterChipActive
                    : { backgroundColor: colors.surface, borderColor: '#334155' },
                ]}
                onPress={() => setActiveFilter(filter)}
              >
                <Text style={[styles.filterText, isActive ? styles.filterTextActive : { color: '#cbd5e1' }]}>
                  {filter}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchHazards}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredHazards}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No hazards found.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  headerIcon: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff', letterSpacing: -0.5 },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    position: 'relative',
    justifyContent: 'center',
  },
  searchIcon: { position: 'absolute', left: 32, zIndex: 1 },
  searchInput: { height: 44, borderRadius: 12, paddingLeft: 40, paddingRight: 16, fontSize: 14 },
  filterScrollContainer: { paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, borderWidth: 1 },
  filterChipActive: { backgroundColor: '#1973f0', borderColor: '#1973f0' },
  filterText: { fontSize: 12, fontWeight: '500' },
  filterTextActive: { color: '#ffffff', fontWeight: '600' },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  dateHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    letterSpacing: 1,
    paddingTop: 8,
    paddingBottom: 8,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#1e2936',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  thumbnailContainer: { width: 80, height: 80, marginRight: 16 },
  thumbnailImage: { width: '100%', height: '100%' },
  thumbnailPlaceholder: { backgroundColor: '#1e293b', borderRadius: 8 },
  iconOverlay: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    padding: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#1e2936',
  },
  cardContent: { flex: 1, justifyContent: 'center' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#ffffff', flex: 1, paddingRight: 8 },
  cardTime: { fontSize: 10, color: '#94a3b8' },
  cardDescription: { fontSize: 12, color: '#94a3b8', marginTop: 2, marginBottom: 8 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    gap: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '500' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  errorText: { color: '#94a3b8', fontSize: 14, marginBottom: 12, textAlign: 'center' },
  emptyText: { color: '#94a3b8', fontSize: 14 },
  retryButton: { backgroundColor: '#1973f0', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
});
