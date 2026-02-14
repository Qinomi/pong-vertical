import { getUserId, signOut } from '@/lib/auth';
import { updateUserProfile } from '@/lib/firestore-user';
import {
  AI_DIFFICULTY_OPTIONS,
  BALL_SIZE_OPTIONS,
  BALL_SPEED_OPTIONS,
  BALL_SPIN_OPTIONS,
  DEFAULT_SETTINGS,
  PADDLE_INSET_OPTIONS,
  PADDLE_WIDTH_OPTIONS,
  SPEEDUP_OPTIONS,
  loadSettingsOnce,
  resetSettings,
  updateSettings,
  useSettings,
  type BubbleOption,
} from '@/lib/settings';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Page = 'HOME' | 'BALLS' | 'PADDLES' | 'GAMEPLAY' | 'AI' | 'PHYSICS';

type BubbleGroupProps<K extends string> = {
  value: K;
  options: readonly BubbleOption<K>[];
  onChange: (v: K) => void;
};

function BubbleGroup<K extends string>({ value, options, onChange }: BubbleGroupProps<K>) {
  return (
    <View style={styles.bubbleGroup}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[styles.bubbleBtn, active && styles.bubbleBtnActive]}
            onPress={() => onChange(opt.key)}
            activeOpacity={0.85}
          >
            <Text style={[styles.bubbleText, active && styles.bubbleTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

type CategoryRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  title: string;
  subtitle: string;
  onPress: () => void;
};

function CategoryRow({ icon, accent, title, subtitle, onPress }: CategoryRowProps) {
  return (
    <TouchableOpacity style={styles.categoryRow} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.categoryIcon, { borderColor: accent }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <View style={styles.categoryTextCol}>
        <Text style={styles.categoryTitle}>{title}</Text>
        <Text style={styles.categorySubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.55)" />
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const settings = useSettings();
  const [page, setPage] = useState<Page>('HOME');

  // Profile State
  const [displayName, setDisplayName] = useState('');
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    void loadSettingsOnce();

    // Load initial name
    import('@/lib/auth').then(({ getCurrentUser }) => {
      const user = getCurrentUser();
      if (user?.displayName) {
        setDisplayName(user.displayName);
      }
    });
  }, []);

  const handleUpdateName = async () => {
    if (!displayName.trim()) return;

    const userId = getUserId();
    if (!userId) return;

    setIsUpdatingName(true);
    try {
      const success = await updateUserProfile(userId, displayName.trim());
      await import('@/lib/auth').then(({ updateCurrentUserDisplayName }) =>
        updateCurrentUserDisplayName(displayName.trim())
      );

      if (success) {
        // Check platform for alert
        if (Platform.OS === 'web') {
          alert('Name updated successfully!');
        } else {
          Alert.alert('Success', 'Name updated successfully!');
        }
      } else {
        if (Platform.OS === 'web') alert('Saved locally. Cloud sync will retry when online.');
        else Alert.alert('Saved locally', 'Cloud sync will retry when online.');
      }
    } catch (e) {
      if (Platform.OS === 'web') alert('Error updating name.');
      else Alert.alert('Error', 'Error updating name.');
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await signOut();
      router.replace('/login');
    } catch (error) {
      console.warn('Logout failed:', error);
      if (Platform.OS === 'web') alert('Logout failed.');
      else Alert.alert('Error', 'Logout failed.');
      setIsLoggingOut(false);
    }
  };

  const pageTitle = useMemo(() => {
    switch (page) {
      case 'BALLS':
        return 'BALLS';
      case 'PADDLES':
        return 'PADDLES';
      case 'GAMEPLAY':
        return 'GAMEPLAY';
      case 'AI':
        return 'AI';
      case 'PHYSICS':
        return 'PHYSICS';
      default:
        return 'SETTINGS';
    }
  }, [page]);

  const goBack = () => {
    if (page !== 'HOME') setPage('HOME');
    else router.back();
  };

  const handleResetData = () => {
    const performReset = async () => {
      try {
        // 1) Reset settings
        resetSettings();
        // 2) Clear SQL database (native)
        if (Platform.OS !== 'web') {
          try {
            const SQLite = await import('expo-sqlite');
            const db = await SQLite.openDatabaseAsync('pong_scores.db');
            await db.execAsync('DELETE FROM scores;');
          } catch {
            // ignore (e.g., sqlite not available on this platform)
          }
        }

        // 3) Clear localStorage scores (web)
        if (Platform.OS === 'web') {
          try {
            localStorage.removeItem('pong_scores');
          } catch {
            // ignore
          }
        }

        // eslint-disable-next-line no-alert
        if (Platform.OS === 'web') alert('Success: All data and scores have been wiped.');
        else Alert.alert('Success', 'All data and scores have been wiped.');

      } catch {
        // eslint-disable-next-line no-alert
        if (Platform.OS === 'web') alert('Error: Could not reset data.');
        else Alert.alert('Error', 'Could not reset data.');
      }
    };

    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (confirm('Are you sure you want to reset ALL data? This cannot be undone.')) {
        void performReset();
      }
    } else {
      Alert.alert('RESET ALL DATA', 'This will wipe all scores and reset settings. Continue?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'RESET', style: 'destructive', onPress: () => void performReset() },
      ]);
    }
  };

  const ballSizeLabel = BALL_SIZE_OPTIONS.find((o) => o.key === settings.ballSize)?.label ?? settings.ballSize;
  const ballSpeedLabel = BALL_SPEED_OPTIONS.find((o) => o.key === settings.ballSpeed)?.label ?? settings.ballSpeed;
  const paddleWidthLabel = PADDLE_WIDTH_OPTIONS.find((o) => o.key === settings.paddleWidth)?.label ?? settings.paddleWidth;
  const paddleInsetLabel = PADDLE_INSET_OPTIONS.find((o) => o.key === settings.paddleInset)?.label ?? settings.paddleInset;
  const speedupLabel = SPEEDUP_OPTIONS.find((o) => o.key === settings.speedupPerHit)?.label ?? settings.speedupPerHit;
  const aiLabel = AI_DIFFICULTY_OPTIONS.find((o) => o.key === settings.aiDifficulty)?.label ?? settings.aiDifficulty;
  const spinLabel = BALL_SPIN_OPTIONS.find((o) => o.key === settings.ballSpin)?.label ?? settings.ballSpin;

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0f0c29', '#302b63', '#24243e']} style={styles.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#00f3ff" />
        </TouchableOpacity>
        <Text style={styles.title}>{pageTitle}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {page === 'HOME' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>PROFILE</Text>

              <View style={styles.settingItem}>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>DISPLAY NAME</Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      style={styles.textInput}
                      value={displayName}
                      onChangeText={setDisplayName}
                      placeholder="Enter your name"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      maxLength={12}
                    />
                    <TouchableOpacity
                      style={[styles.saveBtn, isUpdatingName && { opacity: 0.5 }]}
                      onPress={handleUpdateName}
                      disabled={isUpdatingName}
                    >
                      <Text style={styles.saveBtnText}>{isUpdatingName ? '...' : 'SAVE'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.logoutBtn, isLoggingOut && { opacity: 0.6 }]}
                onPress={handleLogout}
                disabled={isLoggingOut}
              >
                <Ionicons name="log-out-outline" size={18} color="#ff4b2b" />
                <Text style={styles.logoutBtnText}>{isLoggingOut ? 'LOGGING OUT...' : 'LOG OUT'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>GENERAL</Text>

              <View style={styles.settingItem}>
                <View style={styles.labelRow}>
                  <Ionicons name="notifications-outline" size={20} color="#fff" style={{ marginRight: 10 }} />
                  <Text style={styles.settingLabel}>VIBRATION</Text>
                </View>
                <Switch
                  value={settings.vibration}
                  onValueChange={(val) => updateSettings({ vibration: val })}
                  trackColor={{ false: '#767577', true: '#00f3ff' }}
                  thumbColor={settings.vibration ? '#fff' : '#f4f3f4'}
                />
              </View>

              <View style={styles.settingItem}>
                <View style={styles.labelRow}>
                  <Ionicons name="volume-medium-outline" size={20} color="#fff" style={{ marginRight: 10 }} />
                  <Text style={styles.settingLabel}>SOUND EFFECTS</Text>
                </View>
                <Switch
                  value={settings.sound}
                  onValueChange={(val) => updateSettings({ sound: val })}
                  trackColor={{ false: '#767577', true: '#ff00ff' }}
                  thumbColor={settings.sound ? '#fff' : '#f4f3f4'}
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>TUNING</Text>
              <Text style={styles.sectionSubtitle}>APPLIES TO LOCAL MODES (FIRST TO X, TIME ATTACK)</Text>

              <CategoryRow
                icon="radio-button-on"
                accent="#00f3ff"
                title="BALLS"
                subtitle={`Size: ${ballSizeLabel}  •  Speed: ${ballSpeedLabel}`}
                onPress={() => setPage('BALLS')}
              />

              <CategoryRow
                icon="remove"
                accent="#ff00ff"
                title="PADDLES"
                subtitle={`Width: ${paddleWidthLabel}  •  Position: ${paddleInsetLabel}`}
                onPress={() => setPage('PADDLES')}
              />

              <CategoryRow
                icon="speedometer"
                accent="#00f3ff"
                title="GAMEPLAY"
                subtitle={`Speedup per hit: ${speedupLabel}`}
                onPress={() => setPage('GAMEPLAY')}
              />

              <CategoryRow
                icon="hardware-chip-outline"
                accent="#ff00ff"
                title="AI"
                subtitle={`Difficulty: ${aiLabel}`}
                onPress={() => setPage('AI')}
              />

              <CategoryRow
                icon="aperture-outline"
                accent="#00f3ff"
                title="PHYSICS"
                subtitle={`Ball spin: ${spinLabel}`}
                onPress={() => setPage('PHYSICS')}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>HOW TO PLAY</Text>
              <View style={styles.tutorialBox}>
                <Text style={styles.tutorialText}>
                  1. Drag the blue paddle horizontally at the bottom.

                  2. Do not let the ball pass your paddle.

                  3. Score by getting the ball past the opponent's paddle.

                  4. Try PHYSICS → Ball Spin for curved shots and AI → Difficulty for different opponents.
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.resetButton} onPress={handleResetData}>
              <Text style={styles.resetButtonText}>RESET ALL DATA</Text>
            </TouchableOpacity>
          </>
        )}

        {page === 'BALLS' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>BALLS</Text>

              <Text style={styles.groupLabel}>BALL SIZE</Text>
              <BubbleGroup value={settings.ballSize} options={BALL_SIZE_OPTIONS} onChange={(k) => updateSettings({ ballSize: k })} />

              <Text style={[styles.groupLabel, { marginTop: 22 }]}>BALL SPEED</Text>
              <BubbleGroup value={settings.ballSpeed} options={BALL_SPEED_OPTIONS} onChange={(k) => updateSettings({ ballSpeed: k })} />
            </View>

            <View style={styles.hintBox}>
              <Ionicons name="information-circle" size={16} color="rgba(255,255,255,0.6)" />
              <Text style={styles.hintText}>These are preset values (no manual numbers).</Text>
            </View>
          </>
        )}

        {page === 'PADDLES' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>PADDLES</Text>

              <Text style={styles.groupLabel}>PADDLE WIDTH</Text>
              <BubbleGroup value={settings.paddleWidth} options={PADDLE_WIDTH_OPTIONS} onChange={(k) => updateSettings({ paddleWidth: k })} />

              <Text style={[styles.groupLabel, { marginTop: 22 }]}>PADDLE DISTANCE FROM CENTER</Text>
              <Text style={styles.helperText}>Close moves paddles toward the middle. Far moves them toward the edges.</Text>
              <BubbleGroup value={settings.paddleInset} options={PADDLE_INSET_OPTIONS} onChange={(k) => updateSettings({ paddleInset: k })} />
            </View>
          </>
        )}

        {page === 'GAMEPLAY' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>GAMEPLAY</Text>

              <Text style={styles.groupLabel}>SPEEDUP PER HIT</Text>
              <BubbleGroup value={settings.speedupPerHit} options={SPEEDUP_OPTIONS} onChange={(k) => updateSettings({ speedupPerHit: k })} />

              <Text style={styles.helperText}>Higher = the ball accelerates faster after each paddle hit.</Text>
            </View>

            <TouchableOpacity
              style={styles.restoreDefaultsButton}
              onPress={() => updateSettings({ ...DEFAULT_SETTINGS })}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh" size={18} color="#00f3ff" style={{ marginRight: 10 }} />
              <Text style={styles.restoreDefaultsText}>RESTORE DEFAULTS</Text>
            </TouchableOpacity>
          </>
        )}

        {page === 'AI' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>AI</Text>

              <Text style={styles.groupLabel}>DIFFICULTY</Text>
              <BubbleGroup value={settings.aiDifficulty} options={AI_DIFFICULTY_OPTIONS} onChange={(k) => updateSettings({ aiDifficulty: k })} />

              <Text style={styles.helperText}>
                Easy reacts slower and makes mistakes. Hard/Insane react faster and (optionally) predict where the ball will land.
              </Text>
            </View>

            <View style={styles.hintBox}>
              <Ionicons name="warning" size={16} color="rgba(255,255,255,0.6)" />
              <Text style={styles.hintText}>Insane is meant to be unfair. Try it as a challenge mode.</Text>
            </View>
          </>
        )}

        {page === 'PHYSICS' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>PHYSICS</Text>

              <Text style={styles.groupLabel}>BALL SPIN</Text>
              <BubbleGroup value={settings.ballSpin} options={BALL_SPIN_OPTIONS} onChange={(k) => updateSettings({ ballSpin: k })} />

              <Text style={styles.helperText}>
                Spin adds curve to the ball after paddle hits. Hit near the edges of the paddle for stronger curve.
              </Text>
            </View>

            <View style={styles.hintBox}>
              <Ionicons name="flash-outline" size={16} color="rgba(255,255,255,0.6)" />
              <Text style={styles.hintText}>Low/Normal feels "arcade". High enables banana shots.</Text>
            </View>
          </>
        )}
      </ScrollView>

      <Text style={styles.version}>VERSION 1.4.1 • NEO PONG ARENA</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  background: { ...StyleSheet.absoluteFillObject },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: 2 },

  content: { padding: 20 },

  section: { marginBottom: 28 },
  sectionTitle: {
    color: '#ff00ff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 15,
    textTransform: 'uppercase',
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: -10,
    marginBottom: 15,
  },

  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 18,
    borderRadius: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  // New Profile Styles
  inputContainer: { flex: 1 },
  inputLabel: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  inputRow: { flexDirection: 'row', gap: 10 },
  textInput: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  saveBtn: {
    backgroundColor: '#00f3ff',
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 14,
  },
  logoutBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 75, 43, 0.35)',
    backgroundColor: 'rgba(255, 75, 43, 0.08)',
  },
  logoutBtnText: {
    color: '#ff4b2b',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },

  labelRow: { flexDirection: 'row', alignItems: 'center' },
  settingLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },

  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    marginBottom: 12,
  },
  categoryIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryTextCol: { flex: 1, marginLeft: 12 },
  categoryTitle: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  categorySubtitle: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600', marginTop: 4 },

  groupLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 10,
  },
  helperText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
  },

  bubbleGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bubbleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  bubbleBtnActive: { borderColor: '#00f3ff', backgroundColor: 'rgba(0,243,255,0.12)' },
  bubbleText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  bubbleTextActive: { color: '#00f3ff' },

  tutorialBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 20,
    borderRadius: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#00f3ff',
  },
  tutorialText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 14,
    lineHeight: 24,
    fontWeight: '500',
  },

  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 15,
    padding: 14,
  },
  hintText: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600', flex: 1 },

  resetButton: {
    marginTop: 10,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 75, 43, 0.3)',
    backgroundColor: 'rgba(255, 75, 43, 0.05)',
    borderRadius: 15,
    alignItems: 'center',
  },
  resetButtonText: { color: '#ff4b2b', fontWeight: '800', letterSpacing: 1 },

  restoreDefaultsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(0,243,255,0.25)',
    backgroundColor: 'rgba(0,243,255,0.06)',
    marginTop: 10,
  },
  restoreDefaultsText: { color: '#00f3ff', fontWeight: '900', letterSpacing: 2 },

  version: {
    position: 'absolute',
    bottom: 40,
    width: '100%',
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.15)',
    fontSize: 10,
    fontWeight: '700',
  },
});
