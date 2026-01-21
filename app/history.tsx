import { GameMode, getScoresByMode, ScoreEntry } from '@/lib/db';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type HistoryMode = 'FIRST_TO_X' | 'TIME_ATTACK';

function normalizeModeParam(m: unknown): HistoryMode {
  return m === 'TIME_ATTACK' ? 'TIME_ATTACK' : 'FIRST_TO_X';
}

function isWin(entry: ScoreEntry): boolean {
  const mode = (entry.mode === 'FIRST_TO_5' ? 'FIRST_TO_X' : entry.mode) as GameMode;

  if (mode === 'TIME_ATTACK') {
    const survived = entry.timeSpent ?? entry.playerScore ?? 0;
    const target = entry.targetSeconds ?? 60;
    return entry.aiScore === 0 && survived >= target;
  }

  // FIRST_TO_X
  return entry.playerScore > entry.aiScore;
}

function fmtDate(ts: number) {
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return '';
  }
}

export default function HistoryScreen() {
  const params = useLocalSearchParams();
  const initialMode = normalizeModeParam(params.mode);

  const [mode, setMode] = useState<HistoryMode>(initialMode);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMode(initialMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.mode]);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    getScoresByMode(mode as GameMode, 80)
      .then((s) => {
        if (!alive) return;
        setScores(s);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [mode]);

  const stats = useMemo(() => {
    const w = scores.filter(isWin).length;
    return { total: scores.length, wins: w, losses: scores.length - w };
  }, [scores]);

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={['#020024', '#1a237e', '#080808']} style={StyleSheet.absoluteFillObject} />

      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>

        <Text style={s.headerTitle}>HALL OF FAME</Text>

        <View style={{ width: 44 }} />
      </View>

      <View style={s.tabs}>
        <Pressable
          onPress={() => setMode('FIRST_TO_X')}
          style={[s.tab, mode === 'FIRST_TO_X' && s.tabActive]}
        >
          <Text style={[s.tabText, mode === 'FIRST_TO_X' && s.tabTextActive]}>FIRST TO X</Text>
        </Pressable>

        <Pressable
          onPress={() => setMode('TIME_ATTACK')}
          style={[s.tab, mode === 'TIME_ATTACK' && s.tabActive]}
        >
          <Text style={[s.tabText, mode === 'TIME_ATTACK' && s.tabTextActive]}>TIME ATTACK</Text>
        </Pressable>
      </View>

      <View style={s.statsRow}>
        <Text style={s.statsText}>GAMES: {stats.total}</Text>
        <Text style={[s.statsText, { color: '#00f3ff' }]}>W: {stats.wins}</Text>
        <Text style={[s.statsText, { color: '#ff4b2b' }]}>L: {stats.losses}</Text>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#00f3ff" />
          <Text style={s.loadingText}>LOADING SCORES…</Text>
        </View>
      ) : scores.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="trophy-outline" size={42} color="rgba(255,255,255,0.45)" />
          <Text style={s.emptyTitle}>NO ENTRIES YET</Text>
          <Text style={s.emptySub}>Play a match to record your first run.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
          {scores.map((entry, idx) => {
            const win = isWin(entry);
            const verdictColor = win ? '#00f3ff' : '#ff4b2b';
            const date = fmtDate(entry.createdAt);

            if (mode === 'TIME_ATTACK') {
              const survived = entry.timeSpent ?? entry.playerScore ?? 0;
              const target = entry.targetSeconds ?? 60;

              return (
                <View key={String(entry.id ?? idx)} style={s.card}>
                  <View style={s.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.nameText} numberOfLines={1}>
                        {entry.name || 'YOU'}
                      </Text>
                      <Text style={s.dateText}>{date}</Text>
                    </View>

                    <View style={[s.badge, { borderColor: verdictColor }]}>
                      <Text style={[s.badgeText, { color: verdictColor }]}>{win ? 'WIN' : 'LOSS'}</Text>
                    </View>
                  </View>

                  <View style={s.cardMid}>
                    <Text style={s.modeHint}>SURVIVED</Text>
                    <Text style={[s.bigVal, { color: verdictColor }]}>{survived}s</Text>
                    <Text style={s.smallHint}>TARGET {target}s • BREACHES {entry.aiScore}</Text>
                  </View>
                </View>
              );
            }

            // FIRST_TO_X
            const firstTo = entry.firstTo ?? 5;
            return (
              <View key={String(entry.id ?? idx)} style={s.card}>
                <View style={s.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.nameText} numberOfLines={1}>
                      {entry.name || 'YOU'}
                    </Text>
                    <Text style={s.dateText}>{date}</Text>
                  </View>

                  <View style={[s.badge, { borderColor: verdictColor }]}>
                    <Text style={[s.badgeText, { color: verdictColor }]}>{win ? 'WIN' : 'LOSS'}</Text>
                  </View>
                </View>

                <View style={s.cardMid}>
                  <Text style={s.modeHint}>SCORE</Text>
                  <View style={s.scoreRow}>
                    <Text style={[s.scoreNum, { color: win ? '#00f3ff' : verdictColor }]}>{entry.playerScore}</Text>
                    <Text style={s.scoreSep}>:</Text>
                    <Text style={[s.scoreNum, { color: '#ff00ff' }]}>{entry.aiScore}</Text>
                  </View>
                  <Text style={s.smallHint}>FIRST TO {firstTo}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 3 },

  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    paddingBottom: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: 'rgba(0,243,255,0.12)',
    borderColor: 'rgba(0,243,255,0.35)',
  },
  tabText: { color: 'rgba(255,255,255,0.65)', fontWeight: '900', letterSpacing: 2, fontSize: 11 },
  tabTextActive: { color: '#00f3ff' },

  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  statsText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '900', letterSpacing: 2 },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '900', letterSpacing: 2 },

  emptyTitle: { marginTop: 12, color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  emptySub: { marginTop: 6, color: 'rgba(255,255,255,0.55)', textAlign: 'center' },

  card: {
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 14,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center' },

  nameText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  dateText: { marginTop: 4, color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700' },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  badgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 2 },

  cardMid: { marginTop: 12, alignItems: 'center' },
  modeHint: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  bigVal: { marginTop: 4, fontSize: 44, fontWeight: '900' },
  smallHint: { marginTop: 6, color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  scoreRow: { marginTop: 4, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  scoreNum: { fontSize: 44, fontWeight: '900' },
  scoreSep: { fontSize: 30, fontWeight: '900', color: 'rgba(255,255,255,0.35)' },
});
