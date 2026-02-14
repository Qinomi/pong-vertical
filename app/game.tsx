import { GameMode, GameResult, PongGame } from '@/components/PongGame';
import { getUserId } from '@/lib/auth';
import { AI_PLAYER_ID, createOrGetPlayer } from '@/lib/db';
import { saveFirstToXWithSync, saveTimeAttackWithSync } from '@/lib/sync';
import { styles } from '@/styles/styles';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';

function parseIntParam(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeModeForHistory(mode: GameMode): 'FIRST_TO_X' | 'TIME_ATTACK' {
  return mode === 'TIME_ATTACK' ? 'TIME_ATTACK' : 'FIRST_TO_X';
}

function isWinResult(result: GameResult, fallbackTimeLimit: number): boolean {
  if (result.mode === 'TIME_ATTACK') {
    const target = result.targetSeconds ?? fallbackTimeLimit;
    const survived = result.timeSpent ?? result.playerScore;
    return result.aiScore === 0 && survived >= target;
  }
  return result.playerScore > result.aiScore;
}

export default function GameScreen() {
  const params = useLocalSearchParams();
  const userId = getUserId(); // Get logged in user ID

  const mode = (params.mode as GameMode) ?? 'FIRST_TO_5';
  const playerName = (params.name as string) ?? 'YOU';

  const firstTo = useMemo(() => {
    const raw = parseIntParam(params.firstTo ?? params.target ?? params.x);
    if (raw === null) return mode === 'FIRST_TO_5' ? 5 : 5;
    return Math.max(1, Math.min(99, raw));
  }, [params.firstTo, params.target, params.x, mode]);

  const timeLimitSeconds = useMemo(() => {
    const raw = parseIntParam(params.seconds ?? params.targetSeconds ?? params.t);
    if (raw === null) return 60;
    return Math.max(10, Math.min(999, raw));
  }, [params.seconds, params.targetSeconds, params.t]);

  const [pauseVisible, setPauseVisible] = useState(false);

  const [gameOverVisible, setGameOverVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const [isSaved, setIsSaved] = useState(false); // Validating double save

  const win = useMemo(() => (result ? isWinResult(result, timeLimitSeconds) : false), [result, timeLimitSeconds]);

  const handleGameOver = (r: GameResult) => {
    if (gameOverVisible) return; // Prevent multiple triggers
    setResult(r);
    setGameOverVisible(true);
    setIsSaved(false); // Reset save state

    // small “sync” / “processing” phase for the vibe
    setChecking(true);
    setTimeout(() => setChecking(false), 900);
  };

  const handleFinalSaveAndLeaderboard = async () => {
    if (!result) return;

    // Check if already saved
    if (!isSaved) {
      setIsSaved(true);
      const histMode = normalizeModeForHistory(result.mode);
      const player = await createOrGetPlayer(playerName, userId || undefined); // Use real User ID

      if (histMode === 'TIME_ATTACK') {
        const isWin = result.aiScore === 0;
        await saveTimeAttackWithSync(
          {
            playerId: player.player_id,
            verdict: isWin ? 'WIN' : 'LOSE',
            timeDuration: result.timeSpent ?? result.playerScore,
          },
          { playerName, isOnlineMode: false }
        );
      } else {
        const isPlayerWin = result.playerScore > result.aiScore;
        await saveFirstToXWithSync(
          {
            playerId: player.player_id,
            opponentId: AI_PLAYER_ID,
            playerScore: result.playerScore,
            opponentScore: result.aiScore,
            winnerId: isPlayerWin ? player.player_id : AI_PLAYER_ID,
            timeElapsed: result.timeSpent ?? 0,
          },
          { playerName, isOnlineMode: false }
        );
      }
    }

    setGameOverVisible(false);
    // Use replace to avoid stacking
    router.replace({ pathname: '/history', params: { mode: normalizeModeForHistory(result.mode) } });
  };

  const backToMenu = async () => {
    // Save score check
    if (result && !isSaved) {
      setIsSaved(true);
      const histMode = normalizeModeForHistory(result.mode);
      const player = await createOrGetPlayer(playerName, userId || undefined); // Use real User ID

      if (histMode === 'TIME_ATTACK') {
        const isWin = result.aiScore === 0;
        await saveTimeAttackWithSync(
          {
            playerId: player.player_id,
            verdict: isWin ? 'WIN' : 'LOSE',
            timeDuration: result.timeSpent ?? result.playerScore,
          },
          { playerName, isOnlineMode: false }
        );
      } else {
        const isPlayerWin = result.playerScore > result.aiScore;
        await saveFirstToXWithSync(
          {
            playerId: player.player_id,
            opponentId: AI_PLAYER_ID,
            playerScore: result.playerScore,
            opponentScore: result.aiScore,
            winnerId: isPlayerWin ? player.player_id : AI_PLAYER_ID,
            timeElapsed: result.timeSpent ?? 0,
          },
          { playerName, isOnlineMode: false }
        );
      }
    }
    setGameOverVisible(false);
    setPauseVisible(false);
    router.replace('/');
  };

  const openSettings = () => {
    setPauseVisible(false);
    router.push('/settings');
  };

  const summaryMain = useMemo(() => {
    if (!result) return null;

    if (result.mode === 'TIME_ATTACK') {
      const survived = result.timeSpent ?? result.playerScore;
      const target = result.targetSeconds ?? timeLimitSeconds;
      return {
        title: win ? 'SURVIVED' : 'BREACHED',
        leftLabel: 'SURVIVED',
        leftValue: `${survived}s`,
        rightLabel: 'TARGET',
        rightValue: `${target}s`,
        bottomLabel: 'BREACHES',
        bottomValue: `${result.aiScore}`,
      };
    }

    // FIRST_TO modes
    const firstToVal = result.firstTo ?? firstTo;
    return {
      title: win ? 'VICTORY' : 'DEFEAT',
      leftLabel: 'YOU',
      leftValue: `${result.playerScore}`,
      rightLabel: 'AI',
      rightValue: `${result.aiScore}`,
      bottomLabel: 'FIRST TO',
      bottomValue: `${firstToVal}`,
    };
  }, [result, firstTo, timeLimitSeconds, win]);

  return (
    <View style={styles.container}>
      <PongGame
        mode={mode}
        firstTo={mode === 'FIRST_TO_X' || mode === 'FIRST_TO_5' ? firstTo : undefined}
        targetSeconds={mode === 'TIME_ATTACK' ? timeLimitSeconds : undefined}
        onGameOver={handleGameOver}
        isExternalPaused={pauseVisible || gameOverVisible || checking}
        onPausePress={() => setPauseVisible(true)}
        onOptionsPress={() => router.push('/settings')}
      />

      {/* Pause menu */}
      <Modal visible={pauseVisible} transparent animationType="fade" onRequestClose={() => setPauseVisible(false)}>
        <View style={styles.modalOverlay}>
          <LinearGradient colors={['rgba(0,0,0,0.88)', 'rgba(0,0,0,0.65)']} style={styles.menuBox}>
            <Text style={styles.menuTitle}>PAUSED</Text>
            <Text style={styles.subtitle}>The arena is frozen.</Text>

            <TouchableOpacity style={styles.primaryBtn} onPress={() => setPauseVisible(false)}>
              <Text style={styles.primaryBtnText}>RESUME</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuBtn} onPress={openSettings}>
              <Ionicons name="options" size={20} color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.menuBtnText}>SETTINGS</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuBtn} onPress={backToMenu}>
              <Ionicons name="home" size={20} color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.menuBtnText}>QUIT</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </Modal>

      {/* Game over */}
      <Modal visible={gameOverVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <LinearGradient colors={['rgba(0,0,0,0.92)', 'rgba(0,0,0,0.7)']} style={styles.menuBox}>
            {checking ? (
              <View style={styles.checkingBox}>
                <ActivityIndicator size="large" color="#00f3ff" />
                <Text style={styles.checkingText}>PROCESSING…</Text>
                <Text style={styles.subText}>Updating Hall of Fame</Text>
              </View>
            ) : (
              <>
                <View style={styles.winnerHeader}>
                  <Ionicons name={win ? 'trophy' : 'skull'} size={46} color={win ? '#00f3ff' : '#ff4b2b'} />
                  <Text style={[styles.winnerTitle, { color: win ? '#00f3ff' : '#ff4b2b' }]}>
                    {summaryMain?.title ?? 'GAME OVER'}
                  </Text>
                </View>

                <View style={styles.summaryScores}>
                  <View style={styles.sumRow}>
                    <Text style={styles.sumLabel}>{summaryMain?.leftLabel ?? 'YOU'}</Text>
                    <Text style={[styles.sumVal, { color: win ? '#00f3ff' : '#ff4b2b' }]}>{summaryMain?.leftValue ?? '-'}</Text>
                  </View>

                  <View style={styles.sumRowDivider} />

                  <View style={styles.sumRow}>
                    <Text style={styles.sumLabel}>{summaryMain?.rightLabel ?? 'AI'}</Text>
                    <Text style={[styles.sumVal, { color: '#ff00ff' }]}>{summaryMain?.rightValue ?? '-'}</Text>
                  </View>

                  <View style={styles.sumRowDivider} />

                  <View style={styles.sumRow}>
                    <Text style={styles.sumLabel}>{summaryMain?.bottomLabel ?? 'MODE'}</Text>
                    <Text style={styles.sumVal}>{summaryMain?.bottomValue ?? '-'}</Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.primaryBtn} onPress={handleFinalSaveAndLeaderboard}>
                  <Text style={styles.primaryBtnText}>VIEW HISTORY</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuBtn} onPress={backToMenu}>
                  <Ionicons name="home" size={20} color="#fff" style={{ marginRight: 10 }} />
                  <Text style={styles.menuBtnText}>BACK TO MENU</Text>
                </TouchableOpacity>
              </>
            )}
          </LinearGradient>
        </View>
      </Modal>
    </View>
  );
}
