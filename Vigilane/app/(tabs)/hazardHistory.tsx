import React, { useState, useEffect, useCallback } from 'react';
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
import { getHazards } from '../../services/api';
import { Hazard } from '../../types';

const filters = ['All', 'Potholes', 'Accidents', 'Debris', 'Reported'];

const colors = {
  background: '#101822',
  surface: '#1e2936',
  primary: '#1973f0',
  textPrimary: '#ffffff',
  textSecondary: '#94a3b8',
  border: '#1e293b',
};

const getStatusStyle = (status: string) => {
  switch (status) {
    case 'Reported':
      return { bg: 'rgba(34, 197, 94, 0.1)', text: '#4ade80', dot: '#22c55e', border: 'rgba(34, 197, 94, 0.2)' };
    case 'In Review':
      return { bg: 'rgba(234, 179, 8, 0.1)', text: '#facc15', dot: '#eab308', border: 'rgba(234, 179, 8, 0.2)' };
    case 'Ignored':
      return { bg: 'rgba(100, 116, 139, 0.3)', text: '#94a3b8', dot: '#94a3b8', border: 'rgba(100, 116, 139, 0.4)' };
    default:
      return { bg: 'rgba(100, 116, 139, 0.3)', text: '#94a3b8', dot: '#94a3b8', border: 'rgba(100, 116, 139, 0.4)' };
  }
};

export default function ReportHistory() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState('All');
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHazards = useCallback(async (filter: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getHazards(filter);
      setHazards(data);
    } catch (e) {
      setError('Failed to load hazards. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHazards(activeFilter);
  }, [activeFilter, fetchHazards]);

  const renderItem = ({ item, index }: { item: Hazard; index: number }) => {
    const showHeader = index === 0 || hazards[index - 1].dateGroup !== item.dateGroup;
    const statusStyle = getStatusStyle(item.status);

    return (
      <View>
        {showHeader && (
          <Text style={styles.dateHeader}>{item.dateGroup.toUpperCase()}</Text>
        )}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.8}
          onPress={() => router.push({ pathname: '/hazardDetails', params: { id: item.id } })}
        >
          <View style={styles.thumbnailContainer}>
            <ImageBackground
              source={{ uri: item.thumbnailUrl }}
              style={styles.thumbnailImage}
              imageStyle={{ borderRadius: 8 }}
            >
              <View style={[styles.iconOverlay, { backgroundColor: item.iconBg }]}>
                <MaterialIcons name={item.icon as any} size={14} color="#fff" />
              </View>
            </ImageBackground>
          </View>

          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.location}</Text>
              <Text style={styles.cardTime}>{item.time}</Text>
            </View>
            <Text style={styles.cardDescription} numberOfLines={1}>{item.description}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
              <View style={[styles.statusDot, { backgroundColor: statusStyle.dot }]} />
              <Text style={[styles.statusText, { color: statusStyle.text }]}>{item.status}</Text>
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
        <TouchableOpacity style={styles.headerIcon}>
          <MaterialIcons name="arrow-back" size={28} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report History</Text>
        <TouchableOpacity style={styles.headerIcon}>
          <MaterialIcons name="settings" size={28} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
          placeholder="Search streets or hazards..."
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContainer}
        >
          {filters.map((filter) => {
            const isActive = activeFilter === filter;
            return (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterChip,
                  isActive ? styles.filterChipActive : { backgroundColor: colors.surface, borderColor: '#334155' },
                ]}
                onPress={() => setActiveFilter(filter)}
              >
                <Text style={[
                  styles.filterText,
                  isActive ? styles.filterTextActive : { color: '#cbd5e1' },
                ]}>
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
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchHazards(activeFilter)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={hazards}
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
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    position: 'relative',
    justifyContent: 'center',
  },
  searchIcon: { position: 'absolute', left: 32, zIndex: 1 },
  searchInput: {
    height: 44,
    borderRadius: 12,
    paddingLeft: 40,
    paddingRight: 16,
    fontSize: 14,
  },
  filterScrollContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
    paddingRight: 8,
  },
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
  retryButton: {
    backgroundColor: '#1973f0',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
