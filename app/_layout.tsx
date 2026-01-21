import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadSettingsOnce } from '@/lib/settings';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    void loadSettingsOnce();
  }, []);

  return (
    <ThemeProvider value={DarkTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="game" />
        <Stack.Screen name="history" />
        <Stack.Screen name="settings" />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
