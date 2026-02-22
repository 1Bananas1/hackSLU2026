import React from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useIsFocused } from '@react-navigation/native';
import Constants from 'expo-constants';
import { useRoadDamageDetector } from '@/hooks/use-road-damage-detector';

const IS_EMULATOR = !Constants.isDevice;

export default function CameraScreen() {
  const isFocused = useIsFocused();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const { frameProcessor, detections, modelState } = useRoadDamageDetector();
  const pixelFormat = Platform.OS === 'ios' ? 'rgb' : 'yuv';

  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>
          Camera permission is required to detect road damage.
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Camera Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>No camera found on this device.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isFocused}
        frameProcessor={IS_EMULATOR ? undefined : frameProcessor}
        pixelFormat={pixelFormat}
      />

      {/* Show a spinner while the TFLite model loads */}
      {modelState === 'loading' && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Loading road damage model…</Text>
        </View>
      )}

      {/* Bounding box overlays — coordinates are normalised [0, 1] */}
      {detections.map((det, i) => (
        <View
          key={i}
          style={[
            styles.bbox,
            {
              left: `${(det.x1 * 100).toFixed(2)}%` as unknown as number,
              top: `${(det.y1 * 100).toFixed(2)}%` as unknown as number,
              width: `${((det.x2 - det.x1) * 100).toFixed(2)}%` as unknown as number,
              height: `${((det.y2 - det.y1) * 100).toFixed(2)}%` as unknown as number,
            },
          ]}>
          <Text style={styles.bboxLabel}>
            {det.className} {(det.confidence * 100).toFixed(0)}%
          </Text>
        </View>
      ))}

      {/* Status bar at the bottom */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          {modelState === 'loading'
            ? 'Model loading…'
            : detections.length > 0
              ? `${detections.length} hazard${detections.length > 1 ? 's' : ''} detected`
              : 'Scanning for road damage…'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    padding: 24,
    gap: 16,
  },
  message: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
  },
  bbox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#FF6B35',
    backgroundColor: 'rgba(255, 107, 53, 0.15)',
  },
  bboxLabel: {
    color: '#fff',
    backgroundColor: '#FF6B35',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  statusBar: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  statusText: {
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    fontSize: 14,
    fontWeight: '600',
    overflow: 'hidden',
  },
});
