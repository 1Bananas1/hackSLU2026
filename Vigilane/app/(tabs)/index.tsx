import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, TouchableOpacity } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { createHazard, getHazards, type Hazard } from '@/services/api';

export default function HomeScreen() {
  const [loading, setLoading] = useState(false);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [message, setMessage] = useState('Ready');

  const runAction = async (action: () => Promise<void>) => {
    try {
      setLoading(true);
      await action();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unexpected error';
      setMessage(text);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateHazard = () =>
    runAction(async () => {
      const hazard = await createHazard({
        confidence: 0.87,
        labels: ['pothole'],
        bboxes: [{ x1: 120, y1: 200, x2: 300, y2: 380 }],
        frame_number: hazards.length + 1,
      });
      setHazards((current) => [hazard, ...current]);
      setMessage('Hazard created');
    });

  const handleLoadHazards = () =>
    runAction(async () => {
      const items = await getHazards();
      setHazards(items);
      setMessage(`Loaded ${items.length} hazards`);
    });

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.reactLogo}
        />
      }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Vigilane</ThemedText>
      </ThemedView>

      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Backend Controls</ThemedText>
        <ThemedText>Status: {message}</ThemedText>
        <ThemedText>Hazards: {hazards.length}</ThemedText>
      </ThemedView>

      <ThemedView style={styles.stepContainer}>
        <TouchableOpacity
          style={styles.button}
          disabled={loading}
          onPress={handleCreateHazard}>
          <ThemedText style={styles.buttonText}>Create Hazard</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          disabled={loading}
          onPress={handleLoadHazards}>
          <ThemedText style={styles.buttonText}>Load My Hazards</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Recent Hazard IDs</ThemedText>
        {hazards.length === 0 ? (
          <ThemedText>No hazards loaded</ThemedText>
        ) : (
          hazards.slice(0, 5).map((hazard) => (
            <ThemedText key={hazard.id}>• {hazard.id}</ThemedText>
          ))
        )}
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: Colors.light.tint,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
});
