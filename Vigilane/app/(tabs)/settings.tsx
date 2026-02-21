import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  SafeAreaView, 
  StatusBar,
  Switch
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export default function SafetySettings() {
  // State for toggles
  const [potholesEnabled, setPotholesEnabled] = useState(true);
  const [debrisEnabled, setDebrisEnabled] = useState(true);
  const [stalledVehiclesEnabled, setStalledVehiclesEnabled] = useState(true);
  const [trafficAccidentsEnabled, setTrafficAccidentsEnabled] = useState(false);
  const [audioAlertsEnabled, setAudioAlertsEnabled] = useState(true);
  const [visualFlashesEnabled, setVisualFlashesEnabled] = useState(false);
  const [autoUploadEnabled, setAutoUploadEnabled] = useState(true);

  // Common colors to match the dark theme in the HTML
  const colors = {
    background: '#101822',
    surface: '#1a2432',
    primary: '#1973f0',
    primaryLight: 'rgba(25, 115, 240, 0.2)',
    textPrimary: '#ffffff',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    border: '#1e293b',
    switchTrackFalse: '#334155',
    switchTrackTrue: '#1973f0',
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backButton}>
          <MaterialIcons name="arrow-back-ios" size={20} color={colors.textPrimary} style={{ marginLeft: 6 }} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Safety Settings
        </Text>
        <View style={{ width: 48 }} /> {/* Spacer to balance the header */}
      </View>

      {/* Scrollable Content */}
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        
        {/* Active Detection Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            ACTIVE DETECTION
          </Text>
          
          <View style={[styles.cardGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            
            {/* Potholes */}
            <View style={[styles.cardRow, { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
              <View style={styles.cardRowLeft}>
                <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
                  <MaterialIcons name="error-outline" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.rowText, { color: colors.textPrimary }]}>Potholes</Text>
              </View>
              <Switch
                trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.switchTrackFalse}
                onValueChange={setPotholesEnabled}
                value={potholesEnabled}
              />
            </View>

            {/* Debris */}
            <View style={[styles.cardRow, { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
              <View style={styles.cardRowLeft}>
                <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
                  <MaterialIcons name="delete-outline" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.rowText, { color: colors.textPrimary }]}>Debris</Text>
              </View>
              <Switch
                trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.switchTrackFalse}
                onValueChange={setDebrisEnabled}
                value={debrisEnabled}
              />
            </View>

            {/* Stalled Vehicles */}
            <View style={[styles.cardRow, { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
              <View style={styles.cardRowLeft}>
                <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
                  <MaterialIcons name="directions-car" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.rowText, { color: colors.textPrimary }]}>Stalled Vehicles</Text>
              </View>
              <Switch
                trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.switchTrackFalse}
                onValueChange={setStalledVehiclesEnabled}
                value={stalledVehiclesEnabled}
              />
            </View>

            {/* Traffic Accidents */}
            <View style={styles.cardRow}>
              <View style={styles.cardRowLeft}>
                <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
                  <MaterialIcons name="car-crash" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.rowText, { color: colors.textPrimary }]}>Traffic Accidents</Text>
              </View>
              <Switch
                trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.switchTrackFalse}
                onValueChange={setTrafficAccidentsEnabled}
                value={trafficAccidentsEnabled}
              />
            </View>

          </View>
        </View>

        {/* Sensitivity Slider Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            REPORTING SENSITIVITY
          </Text>
          
          <View style={[styles.cardStandalone, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sliderHeader}>
              <Text style={[styles.sliderLabel, { color: colors.textMuted }]}>LOW</Text>
              <Text style={[styles.sliderLabelActive, { color: colors.primary }]}>Medium-High</Text>
              <Text style={[styles.sliderLabel, { color: colors.textMuted }]}>HIGH</Text>
            </View>
            
            {/* Custom Slider Mockup (Use @react-native-community/slider for real implementation) */}
            <View style={styles.sliderTrackContainer}>
              <View style={[styles.sliderTrackBg, { backgroundColor: colors.switchTrackFalse }]} />
              <View style={[styles.sliderTrackFill, { backgroundColor: colors.primary, width: '65%' }]} />
              <View style={[styles.sliderThumb, { left: '65%' }]} />
            </View>
            
            <Text style={[styles.sliderDescription, { color: colors.textSecondary }]}>
              Adjust how aggressively the AI flags potential hazards. Higher sensitivity may cause more false positives but ensures fewer missed incidents.
            </Text>
          </View>
        </View>

        {/* Notification Preferences Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            NOTIFICATION PREFERENCES
          </Text>
          
          <View style={[styles.cardGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            
            {/* Audio Alerts */}
            <View style={[styles.cardRow, { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
              <View style={styles.cardRowLeft}>
                <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
                  <MaterialIcons name="volume-up" size={20} color={colors.primary} />
                </View>
                <View style={styles.rowTextColumn}>
                  <Text style={[styles.rowText, { color: colors.textPrimary }]}>Audio Alerts</Text>
                  <Text style={[styles.rowSubtext, { color: colors.textSecondary }]}>Spoken warnings</Text>
                </View>
              </View>
              <Switch
                trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.switchTrackFalse}
                onValueChange={setAudioAlertsEnabled}
                value={audioAlertsEnabled}
              />
            </View>

            {/* Visual Flashes */}
            <View style={styles.cardRow}>
              <View style={styles.cardRowLeft}>
                <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
                  <MaterialIcons name="flare" size={20} color={colors.primary} />
                </View>
                <View style={styles.rowTextColumn}>
                  <Text style={[styles.rowText, { color: colors.textPrimary }]}>Visual Flashes</Text>
                  <Text style={[styles.rowSubtext, { color: colors.textSecondary }]}>Screen blinks on hazard</Text>
                </View>
              </View>
              <Switch
                trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.switchTrackFalse}
                onValueChange={setVisualFlashesEnabled}
                value={visualFlashesEnabled}
              />
            </View>

          </View>
        </View>

        {/* Auto-Upload Card (Prominent) */}
        <View style={[styles.section, { paddingTop: 8 }]}>
          <View style={[styles.promoCard, { backgroundColor: 'rgba(25, 115, 240, 0.1)', borderColor: colors.primaryLight }]}>
            
            {/* Background Icon Watermark */}
            <View style={styles.watermarkContainer}>
              <MaterialIcons name="cloud-upload" size={80} color={colors.primary} style={{ opacity: 0.1 }} />
            </View>

            <View style={styles.promoHeaderRow}>
              <View style={styles.promoTitleContainer}>
                <MaterialIcons name="security" size={20} color={colors.primary} />
                <Text style={[styles.promoTitle, { color: colors.textPrimary }]}>Auto-upload to Authorities</Text>
              </View>
              <Switch
                trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.switchTrackFalse}
                onValueChange={setAutoUploadEnabled}
                value={autoUploadEnabled}
                style={{ transform: [{ scale: 0.9 }] }} // Slightly smaller to fit layout
              />
            </View>
            
            <Text style={[styles.promoDescription, { color: '#cbd5e1' }]}>
              Automatically verify and send severe incident clips to local DOT/Police services to improve road safety.
            </Text>
          </View>
        </View>

        {/* Footer Actions */}
        <View style={styles.footer}>
          <TouchableOpacity activeOpacity={0.7}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              Restore Default Settings
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  cardGroup: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 16,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowTextColumn: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  rowText: {
    fontSize: 16,
    fontWeight: '500',
  },
  rowSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  cardStandalone: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sliderLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sliderLabelActive: {
    fontSize: 14,
    fontWeight: '700',
  },
  sliderTrackContainer: {
    height: 24,
    justifyContent: 'center',
    position: 'relative',
  },
  sliderTrackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 2,
  },
  sliderTrackFill: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
  },
  sliderThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    transform: [{ translateX: -10 }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  sliderDescription: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 16,
  },
  promoCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  watermarkContainer: {
    position: 'absolute',
    top: -10,
    right: -10,
    zIndex: 0,
  },
  promoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    zIndex: 1,
  },
  promoTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
    flex: 1,
    paddingRight: 16,
  },
  promoTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  promoDescription: {
    fontSize: 13,
    lineHeight: 18,
    zIndex: 1,
    paddingRight: 24,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  footerText: {
    fontSize: 14,
    fontWeight: '500',
  },
});