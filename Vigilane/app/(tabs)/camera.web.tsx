/**
 * Web fallback for the Camera screen.
 *
 * react-native-vision-camera and react-native-fast-tflite are native-only and
 * cannot run in a browser. This file is served instead of camera.tsx on web.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function CameraScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>📷</Text>
      <Text style={styles.title}>Camera not available on web</Text>
      <Text style={styles.body}>
        Road-damage detection requires a native iOS or Android device.
        Please open the app on your phone to use this feature.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    padding: 32,
    gap: 16,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    color: '#aaa',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
