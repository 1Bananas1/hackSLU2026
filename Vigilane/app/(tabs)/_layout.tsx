import { Redirect, Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';

const colors = {
  background: '#101822',
  border:     '#1e293b',
  active:     '#1973f0',
  inactive:   '#64748b',
};

export default function TabLayout() {
  const { user, loading } = useAuth();

  // Wait for Firebase to resolve the auth state before rendering anything.
  if (loading) return null;

  // Not authenticated — redirect to login.
  // This is the canonical sign-out redirect: when user becomes null after
  // calling signOut(), this layout re-renders and navigates to /login.
  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      initialRouteName="liveDashboard"
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.active,
        tabBarInactiveTintColor: colors.inactive,
      }}
    >
      <Tabs.Screen
        name="liveDashboard"
        options={{
          title: 'Live',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="videocam" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          title: 'Camera',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="camera-alt" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="hazardHistory"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="history" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="settings" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{ href: null }}
      />
    </Tabs>
  );
}
