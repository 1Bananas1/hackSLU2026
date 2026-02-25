/**
 * camera.tsx — stub
 *
 * The full camera + ML detection experience lives in liveDashboard.tsx.
 * react-native-vision-camera requires a development build (npx expo run:ios /
 * npx expo run:android) and cannot run inside Expo Go.
 */
import { View, Text, StyleSheet } from 'react-native';

export default function CameraScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Camera tab</Text>
      <Text style={styles.body}>
        Use the Live tab for real-time detection.{'\n\n'}
        Full camera + ML requires a development build:{'\n'}
        {'  '}npx expo run:ios
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', padding: 32 },
  heading: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  body: { color: '#94a3b8', fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
