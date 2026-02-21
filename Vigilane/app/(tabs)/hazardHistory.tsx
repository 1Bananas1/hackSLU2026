import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  SafeAreaView, 
  StatusBar, 
  ScrollView, 
  ImageBackground,
  FlatList
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

// Mock Data for the list
const historyData = [
  {
    id: '1',
    type: 'pothole',
    dateGroup: 'Today',
    location: 'Main St & 4th Ave',
    time: '8:42 AM',
    description: 'Pothole detected • Lane 2',
    status: 'Reported',
    imageUrl: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&q=80&w=400',
    icon: 'grid-on', // Fallback for grid_goldenratio
    iconBg: '#f97316', // orange-500
  },
  {
    id: '2',
    type: 'accident',
    dateGroup: 'Today',
    location: 'I-95 Northbound',
    time: '7:15 AM',
    description: 'Collision detected • Right Shoulder',
    status: 'In Review',
    imageUrl: 'https://images.unsplash.com/photo-1562620713-3eb582f3fb04?auto=format&fit=crop&q=80&w=400',
    icon: 'car-crash',
    iconBg: '#ef4444', // red-500
  },
  {
    id: '3',
    type: 'debris',
    dateGroup: 'Yesterday',
    location: 'Broadway & 7th',
    time: '5:30 PM',
    description: 'Debris on road • Heavy',
    status: 'Reported',
    imageUrl: 'https://images.unsplash.com/photo-1584824388147-1ceae36e9d69?auto=format&fit=crop&q=80&w=400',
    icon: 'warning',
    iconBg: '#64748b', // slate-500
  },
  {
    id: '4',
    type: 'construction',
    dateGroup: 'Yesterday',
    location: 'Lincoln Tunnel Exit',
    time: '4:12 PM',
    description: 'Construction Zone • Slow Traffic',
    status: 'Ignored',
    imageUrl: 'https://images.unsplash.com/photo-1506526685897-4f46998632dd?auto=format&fit=crop&q=80&w=400',
    icon: 'construction',
    iconBg: '#3b82f6', // blue-500
  },
  {
    id: '5',
    type: 'pothole',
    dateGroup: 'Yesterday',
    location: 'Elm St & Pine',
    time: '8:50 AM',
    description: 'Pothole detected • Lane 1',
    status: 'Reported',
    imageUrl: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&q=80&w=400',
    icon: 'grid-on',
    iconBg: '#f97316', // orange-500
  }
];

export default function ReportHistory() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState('All');

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
    switch(status) {
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

  const renderItem = ({ item, index }: { item: typeof historyData[number]; index: number }) => {
    // Determine if we need to show a date header
    const showHeader = index === 0 || historyData[index - 1].dateGroup !== item.dateGroup;
    const statusStyle = getStatusStyle(item.status);

    return (
      <View>
        {showHeader && (
          <Text style={styles.dateHeader}>{item.dateGroup.toUpperCase()}</Text>
        )}
        
        <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => router.push({ pathname: '/hazardDetails', params: { id: item.id } })}>
          {/* Thumbnail */}
          <View style={styles.thumbnailContainer}>
            <ImageBackground source={{ uri: item.imageUrl }} style={styles.thumbnailImage} imageStyle={{ borderRadius: 8 }}>
              <View style={[styles.iconOverlay, { backgroundColor: item.iconBg }]}>
                <MaterialIcons name={item.icon as any} size={14} color="#fff" />
              </View>
            </ImageBackground>
          </View>

          {/* Content */}
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
      
      {/* Header Section */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIcon}>
          <MaterialIcons name="arrow-back" size={28} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report History</Text>
        <TouchableOpacity style={styles.headerIcon}>
          <MaterialIcons name="settings" size={28} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput 
          style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
          placeholder="Search streets or hazards..."
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      {/* Filter Chips */}
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
                  isActive ? styles.filterChipActive : { backgroundColor: colors.surface, borderColor: '#334155' }
                ]}
                onPress={() => setActiveFilter(filter)}
              >
                <Text style={[
                  styles.filterText, 
                  isActive ? styles.filterTextActive : { color: '#cbd5e1' }
                ]}>
                  {filter}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      {/* History List */}
      <FlatList 
        data={historyData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  headerIcon: {
    padding: 4,
  },
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
  searchIcon: {
    position: 'absolute',
    left: 32,
    zIndex: 1,
  },
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
  filterChipActive: {
    backgroundColor: '#1973f0',
    borderColor: '#1973f0',
  },
  filterText: {
    fontSize: 12,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
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
  thumbnailContainer: {
    width: 80,
    height: 80,
    marginRight: 16,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  iconOverlay: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    padding: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#1e2936',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
  },
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
  cardTime: {
    fontSize: 10,
    color: '#94a3b8',
  },
  cardDescription: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
    marginBottom: 8,
  },
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
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '500',
  },
});