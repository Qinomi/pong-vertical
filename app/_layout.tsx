import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthUser, initAuth, subscribeToAuth } from '@/lib/auth';
import { loadSettingsOnce } from '@/lib/settings';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const router = useRouter();
  const segments = useSegments();

  // Initialize auth and settings
  useEffect(() => {
    const init = async () => {
      await loadSettingsOnce();
      await initAuth();
      setIsLoading(false);
    };
    init();

    // Subscribe to auth changes
    const unsubscribe = subscribeToAuth((authUser) => {
      setUser(authUser);
    });

    return () => unsubscribe();
  }, []);

  // Handle auth state changes - redirect to login if not authenticated
  useEffect(() => {
    if (isLoading) return;

    const inLoginPage = segments[0] === 'login';

    if (!user && !inLoginPage) {
      // Not logged in, redirect to login
      router.replace('/login');
    } else if (user && inLoginPage) {
      // Logged in but on login page, redirect to home
      router.replace('/');
    }
  }, [user, segments, isLoading]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#020024' }}>
        <ActivityIndicator size="large" color="#00f3ff" />
      </View>
    );
  }

  return (
    <ThemeProvider value={DarkTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="index" />
        <Stack.Screen name="game" />
        <Stack.Screen name="history" />
        <Stack.Screen name="settings" />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
