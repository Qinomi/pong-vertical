import { getSettingsSync, resolveTuning, subscribeSettings } from '@/lib/settings';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, PanResponder, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// NOTE: We measure the actual rendered height of the game container via onLayout.
// Using a hard-coded fraction (like 0.8) can make the bottom paddle look "too high"
// compared to the top paddle on different screens / web.
const DEFAULT_ARENA_HEIGHT = SCREEN_HEIGHT;
const PADDLE_HEIGHT = 18;
const MAX_BALL_SPEED = 12;

// --- Live API modifier (Free, no key): Open-Meteo current weather ---
// Small gameplay influences:
// - Temperature affects serve speed (hot = faster, cold = slower)
// - Wind adds a gentle horizontal drift to the ball
// - Stormy codes make the AI slightly more aggressive
// Open-Meteo is free and does not require an API key.
const WEATHER_CITY = 'Bangkok';
const WEATHER_LAT = 13.7563;
const WEATHER_LON = 100.5018;

type WeatherMod = {
  city: string;
  tempC: number | null;
  windMS: number | null;
  windDirDeg: number | null;
  code: number | null;
  speedMul: number;
  aiMul: number;
  windPushX: number; // px/frame-ish
  label: string;
};

function codeLabel(code: number | null): string {
  if (code === null) return 'UNKNOWN';
  if (code === 0) return 'CLEAR';
  if (code >= 1 && code <= 3) return 'CLOUD';
  if (code === 45 || code === 48) return 'FOG';
  if (code >= 51 && code <= 57) return 'DRIZZLE';
  if (code >= 61 && code <= 67) return 'RAIN';
  if (code >= 71 && code <= 77) return 'SNOW';
  if (code >= 80 && code <= 82) return 'SHOWER';
  if (code >= 95 && code <= 99) return 'STORM';
  return 'WEATHER';
}

function computeWeatherMod(input: {
  city: string;
  tempC: number | null;
  windMS: number | null;
  windDirDeg: number | null;
  code: number | null;
}): WeatherMod {
  const base: WeatherMod = {
    city: input.city,
    tempC: input.tempC,
    windMS: input.windMS,
    windDirDeg: input.windDirDeg,
    code: input.code,
    speedMul: 1,
    aiMul: 1,
    windPushX: 0,
    label: codeLabel(input.code),
  };

  // Temperature modifier
  if (typeof input.tempC === 'number') {
    if (input.tempC >= 32) base.speedMul *= 1.10;
    else if (input.tempC <= 18) base.speedMul *= 0.92;
  }

  // Weather code modifier
  switch (base.label) {
    case 'CLEAR':
      base.speedMul *= 1.03;
      break;
    case 'FOG':
    case 'CLOUD':
      base.aiMul *= 1.05;
      break;
    case 'RAIN':
    case 'SHOWER':
      base.speedMul *= 1.02;
      base.aiMul *= 0.98;
      break;
    case 'STORM':
      base.speedMul *= 1.10;
      base.aiMul *= 1.12;
      break;
    case 'SNOW':
      base.speedMul *= 0.95;
      base.aiMul *= 0.95;
      break;
    default:
      break;
  }

  // Wind -> gentle horizontal drift.
  // We take only the X component. (Intentionally game-y, not meteorology-perfect.)
  if (typeof input.windMS === 'number' && typeof input.windDirDeg === 'number') {
    const rad = (input.windDirDeg * Math.PI) / 180;
    const windX = Math.sin(rad); // east-west component-ish
    const mag = clamp(input.windMS / 120, 0, 0.15); // 0..0.15 px/frame-ish
    base.windPushX = windX * mag;
  }

  base.speedMul = clamp(base.speedMul, 0.85, 1.25);
  base.aiMul = clamp(base.aiMul, 0.85, 1.25);
  base.windPushX = clamp(base.windPushX, -0.15, 0.15);
  return base;
}


export type GameMode = 'FIRST_TO_5' | 'TIME_ATTACK';

export interface GameResult {
  playerScore: number;
  aiScore: number;
  mode: GameMode;
  timeSpent?: number;
}

interface PongGameProps {
  mode: GameMode;
  onGameOver: (result: GameResult) => void;
  onPausePress: () => void;
  onOptionsPress: () => void;
  isExternalPaused: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const PongGame: React.FC<PongGameProps> = ({ mode, onGameOver, onPausePress, onOptionsPress, isExternalPaused }) => {
  const isFocused = useIsFocused();
  const [arenaH, setArenaH] = useState(DEFAULT_ARENA_HEIGHT);
  // Game State
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [gameStarted, setGameStarted] = useState(false);
  const [isResetting, setIsResetting] = useState(false);


// Live API modifier (Open-Meteo)
const weatherModRef = useRef<WeatherMod>(
  computeWeatherMod({ city: WEATHER_CITY, tempC: null, windMS: null, windDirDeg: null, code: null })
);
const [weatherPill, setWeatherPill] = useState<string>('WX: SYNC…');

useEffect(() => {
  let cancelled = false;

  const syncWeather = async () => {
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeout = setTimeout(() => controller?.abort(), 4500);

      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LAT}` +
        `&longitude=${WEATHER_LON}` +
        `&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m` +
        `&timezone=auto`;

      const res = await fetch(url, { signal: controller?.signal as any });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const cur = data?.current ?? {};
      const tempC = typeof cur.temperature_2m === 'number' ? cur.temperature_2m : null;
      const code = typeof cur.weather_code === 'number' ? cur.weather_code : null;
      const windMS = typeof cur.wind_speed_10m === 'number' ? cur.wind_speed_10m : null;
      const windDirDeg = typeof cur.wind_direction_10m === 'number' ? cur.wind_direction_10m : null;

      const mod = computeWeatherMod({ city: WEATHER_CITY, tempC, windMS, windDirDeg, code });
      weatherModRef.current = mod;

      if (!cancelled) {
        const tStr = tempC === null ? '?' : Math.round(tempC).toString();
        const wStr = windMS === null ? '?' : windMS.toFixed(1);
        setWeatherPill(`WX ${mod.label} ${tStr}°C W${wStr}`);
      }
    } catch {
      if (!cancelled) setWeatherPill('WX: OFFLINE');
      weatherModRef.current = computeWeatherMod({ city: WEATHER_CITY, tempC: null, windMS: null, windDirDeg: null, code: null });
    }
  };

  syncWeather();
  const id = setInterval(syncWeather, 5 * 60 * 1000); // refresh every 5 minutes
  return () => {
    cancelled = true;
    clearInterval(id);
  };
}, []);

  // Global tuning (from /settings)
  const tuningRef = useRef(resolveTuning(getSettingsSync()));

  const ballPos = useRef({
    x: SCREEN_WIDTH / 2 - tuningRef.current.ballSizePx / 2,
    y: DEFAULT_ARENA_HEIGHT / 2 - tuningRef.current.ballSizePx / 2,
  });
  const ballVel = useRef({ x: 0, y: 0 });

  const playerX = useRef((SCREEN_WIDTH - tuningRef.current.paddleWidthPx) / 2);
  const aiX = useRef((SCREEN_WIDTH - tuningRef.current.paddleWidthPx) / 2);

  const ballRef = useRef<any>(null);
  const playerRef = useRef<any>(null);
  const aiRef = useRef<any>(null);
  const requestRef = useRef<number>(null);

  const triggerHaptic = () => {
    const sets = getSettingsSync();
    if (sets.vibration && Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const updateStyle = (ref: any, style: any) => {
    if (!ref.current) return;
    if (ref.current.setNativeProps) {
      ref.current.setNativeProps({ style });
      return;
    }

    // Web fallback (React Native Web ref DOM node)
    if (Platform.OS === 'web' && ref.current.style) {
      if (style.left !== undefined) ref.current.style.left = `${style.left}px`;
      if (style.top !== undefined) ref.current.style.top = `${style.top}px`;
      if (style.width !== undefined) ref.current.style.width = `${style.width}px`;
      if (style.height !== undefined) ref.current.style.height = `${style.height}px`;
      if (style.borderRadius !== undefined) ref.current.style.borderRadius = `${style.borderRadius}px`;
      if (style.opacity !== undefined) ref.current.style.opacity = style.opacity;
      if (style.transform !== undefined) ref.current.style.transform = style.transform;
      if (style.backgroundColor !== undefined) ref.current.style.backgroundColor = style.backgroundColor;
    }
  };

  // Keep refs in sync if user changes settings while the game is alive.
  useEffect(() => {
    return subscribeSettings(() => {
      const next = resolveTuning(getSettingsSync());
      tuningRef.current = next;

      // Clamp paddle positions to new widths
      playerX.current = clamp(playerX.current, 0, SCREEN_WIDTH - next.paddleWidthPx);
      aiX.current = clamp(aiX.current, 0, SCREEN_WIDTH - next.paddleWidthPx);

      // Clamp ball within bounds for new size
      ballPos.current.x = clamp(ballPos.current.x, 0, SCREEN_WIDTH - next.ballSizePx);
      ballPos.current.y = clamp(ballPos.current.y, 0, arenaH - next.ballSizePx);

      const aiY = next.paddleInsetPx;
      const playerY = arenaH - next.paddleInsetPx - PADDLE_HEIGHT;

      updateStyle(aiRef, { top: aiY, width: next.paddleWidthPx, left: aiX.current });
      updateStyle(playerRef, { top: playerY, width: next.paddleWidthPx, left: playerX.current });
      updateStyle(ballRef, {
        width: next.ballSizePx,
        height: next.ballSizePx,
        borderRadius: next.ballSizePx / 2,
        left: ballPos.current.x,
        top: ballPos.current.y,
      });
    });
  }, [arenaH]);

  // If the game container height changes (web resize / orientation change),
  // re-align paddles to be symmetric from their respective edges.
  useEffect(() => {
    const t = tuningRef.current;
    const ballSize = t.ballSizePx;

    ballPos.current.x = clamp(ballPos.current.x, 0, SCREEN_WIDTH - ballSize);
    ballPos.current.y = clamp(ballPos.current.y, 0, arenaH - ballSize);

    const aiY = t.paddleInsetPx;
    const playerY = arenaH - t.paddleInsetPx - PADDLE_HEIGHT;
    updateStyle(aiRef, { top: aiY });
    updateStyle(playerRef, { top: playerY });
    updateStyle(ballRef, { left: ballPos.current.x, top: ballPos.current.y });
  }, [arenaH]);

  const resetBall = useCallback((serveDirection: number) => {
    const t = tuningRef.current;
    const ballSize = t.ballSizePx;

    setIsResetting(true);
    ballVel.current = { x: 0, y: 0 };
    ballPos.current = {
      x: SCREEN_WIDTH / 2 - ballSize / 2,
      y: arenaH / 2 - ballSize / 2,
    };

    updateStyle(ballRef, {
      left: ballPos.current.x,
      top: ballPos.current.y,
      opacity: 0.5,
      transform: 'scale(1.5)',
      backgroundColor: '#fff',
    });

    setTimeout(() => {
      const baseSpeed = tuningRef.current.ballSpeed * weatherModRef.current.speedMul;
      const angle = (Math.random() - 0.5) * 2;
      ballVel.current = {
        x: angle * baseSpeed,
        y: serveDirection * baseSpeed,
      };

      updateStyle(ballRef, {
        opacity: 1,
        transform: 'scale(1)',
        backgroundColor: serveDirection > 0 ? '#ff00ff' : '#00f3ff',
      });

      setIsResetting(false);
    }, 850);
  }, [arenaH]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const paddleW = tuningRef.current.paddleWidthPx;
        let newX = gestureState.moveX - paddleW / 2;
        newX = clamp(newX, 0, SCREEN_WIDTH - paddleW);
        playerX.current = newX;
        updateStyle(playerRef, { left: playerX.current });
      },
    })
  ).current;

  const update = useCallback(() => {
    // If we're not the active screen (e.g. user navigated to /settings),
    // stop the RAF loop so the ball/timer don't keep running in the background.
    if (!isFocused) return;

    if (!gameStarted || isExternalPaused || isResetting) {
      requestRef.current = requestAnimationFrame(update);
      return;
    }

    const t = tuningRef.current;
    const ballSize = t.ballSizePx;
    const paddleW = t.paddleWidthPx;
    const aiY = t.paddleInsetPx;
    const playerY = arenaH - t.paddleInsetPx - PADDLE_HEIGHT;

    ballPos.current.x += ballVel.current.x;
    ballPos.current.y += ballVel.current.y;
    // Weather drift
    ballPos.current.x += weatherModRef.current.windPushX;

    // Walls
    if (ballPos.current.x <= 0) {
      ballPos.current.x = 0;
      ballVel.current.x *= -1;
      triggerHaptic();
    } else if (ballPos.current.x >= SCREEN_WIDTH - ballSize) {
      ballPos.current.x = SCREEN_WIDTH - ballSize;
      ballVel.current.x *= -1;
      triggerHaptic();
    }

    const ballCenterX = ballPos.current.x + ballSize / 2;

    // Player collision
    if (
      ballVel.current.y > 0 &&
      ballPos.current.y + ballSize >= playerY &&
      ballPos.current.y + ballSize <= playerY + PADDLE_HEIGHT &&
      ballCenterX >= playerX.current &&
      ballCenterX <= playerX.current + paddleW
    ) {
      const speedup = t.speedupFactor;
      const nextVy = clamp(Math.abs(ballVel.current.y) * speedup, 0, MAX_BALL_SPEED);
      ballVel.current.y = -nextVy;

      const hitPoint = (ballCenterX - (playerX.current + paddleW / 2)) / (paddleW / 2);
      ballVel.current.x = clamp(hitPoint * 6, -MAX_BALL_SPEED, MAX_BALL_SPEED);
      ballPos.current.y = playerY - ballSize;

      triggerHaptic();
      updateStyle(ballRef, { backgroundColor: '#00f3ff' });
    }

    // AI collision
    if (
      ballVel.current.y < 0 &&
      ballPos.current.y <= aiY + PADDLE_HEIGHT &&
      ballPos.current.y >= aiY &&
      ballCenterX >= aiX.current &&
      ballCenterX <= aiX.current + paddleW
    ) {
      const speedup = t.speedupFactor;
      const nextVy = clamp(Math.abs(ballVel.current.y) * speedup, 0, MAX_BALL_SPEED);
      ballVel.current.y = nextVy;

      const hitPoint = (ballCenterX - (aiX.current + paddleW / 2)) / (paddleW / 2);
      ballVel.current.x = clamp(hitPoint * 6, -MAX_BALL_SPEED, MAX_BALL_SPEED);
      ballPos.current.y = aiY + PADDLE_HEIGHT;

      triggerHaptic();
      updateStyle(ballRef, { backgroundColor: '#ff00ff' });
    }

    // Score
    if (ballPos.current.y < 0) {
      setPlayerScore((s) => s + 1);
      resetBall(1);
    } else if (ballPos.current.y > arenaH) {
      setAiScore((s) => s + 1);
      resetBall(-1);
    }

    // AI movement
    const aiTarget = ballPos.current.x + ballSize / 2 - paddleW / 2;
    const aiSpeed = (mode === 'TIME_ATTACK' ? 5.2 : 4.0) * weatherModRef.current.aiMul;
    if (Math.abs(aiX.current - aiTarget) > 5) {
      if (aiX.current < aiTarget) aiX.current += aiSpeed;
      else aiX.current -= aiSpeed;
    }

    aiX.current = clamp(aiX.current, 0, SCREEN_WIDTH - paddleW);

    updateStyle(ballRef, { left: ballPos.current.x, top: ballPos.current.y });
    updateStyle(aiRef, { left: aiX.current });

    requestRef.current = requestAnimationFrame(update);
  }, [isFocused, gameStarted, isExternalPaused, isResetting, mode, resetBall, arenaH]);

  useEffect(() => {
    if (!isFocused) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      return;
    }

    requestRef.current = requestAnimationFrame(update);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [update, isFocused]);

  useEffect(() => {
    if (mode === 'TIME_ATTACK' && isFocused && gameStarted && !isExternalPaused && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
      return () => clearInterval(timer);
    }
  }, [mode, isFocused, gameStarted, isExternalPaused, timeLeft]);

  useEffect(() => {
    if (mode === 'FIRST_TO_5' && (playerScore >= 5 || aiScore >= 5)) {
      setGameStarted(false);
      onGameOver({ playerScore, aiScore, mode });
    } else if (mode === 'TIME_ATTACK' && timeLeft <= 0) {
      setGameStarted(false);
      onGameOver({ playerScore, aiScore, mode, timeSpent: 60 });
    }
  }, [playerScore, aiScore, timeLeft, mode, onGameOver]);

  const ArenaGrid = () => (
    <View style={styles.arenaGrid}>
      {[...Array(8)].map((_, i) => (
        <View key={`v-${i}`} style={[styles.gridLineV, { left: (SCREEN_WIDTH / 8) * i }]} />
      ))}
      <View style={[styles.centerLine, { top: arenaH / 2 }]} />
      <View style={[styles.centerCircle, { top: arenaH / 2 - 50 }]} />
    </View>
  );

  const t = tuningRef.current;
  const aiY = t.paddleInsetPx;
  const playerY = arenaH - t.paddleInsetPx - PADDLE_HEIGHT;

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (Number.isFinite(h) && h > 0) setArenaH(h);
      }}
      {...panResponder.panHandlers}
    >
      <LinearGradient colors={['#020024', '#1a237e', '#080808']} style={styles.background} />
      <ArenaGrid />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={onPausePress} style={styles.pauseBtn}>
          <Ionicons name="pause" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.weatherBadge}>
          <Text style={styles.weatherText} numberOfLines={1}>
            {weatherPill}
          </Text>
        </View>

        <View style={styles.centerInfo}>
          {mode === 'TIME_ATTACK' && (
            <Text style={[styles.timer, timeLeft < 10 && styles.lowTime]}>{timeLeft}s</Text>
          )}
        </View>

        <TouchableOpacity onPress={onOptionsPress} style={styles.pauseBtn}>
          <Ionicons name="options" size={24} color="#00f3ff" />
        </TouchableOpacity>
      </View>

      <View style={styles.hud}>
        <View style={styles.pointsDisplay}>
          <View style={[styles.pBox, { borderLeftColor: '#ff00ff' }]}>
            <Text style={styles.pLabel}>AI</Text>
            <Text style={[styles.pScore, { color: '#ff00ff' }]}>{aiScore}</Text>
          </View>
          <View style={[styles.pBox, { borderLeftColor: '#00f3ff', alignItems: 'flex-end' }]}>
            <Text style={styles.pLabel}>YOU</Text>
            <Text style={[styles.pScore, { color: '#00f3ff' }]}>{playerScore}</Text>
          </View>
        </View>
      </View>

      <View
        ref={aiRef}
        style={[styles.paddle, styles.aiPaddle, { top: aiY, left: aiX.current, width: t.paddleWidthPx }]}
      />
      <View
        ref={ballRef}
        style={[
          styles.ball,
          {
            left: ballPos.current.x,
            top: ballPos.current.y,
            width: t.ballSizePx,
            height: t.ballSizePx,
            borderRadius: t.ballSizePx / 2,
          },
        ]}
      />
      <View
        ref={playerRef}
        style={[
          styles.paddle,
          styles.playerPaddle,
          { top: playerY, left: playerX.current, width: t.paddleWidthPx },
        ]}
      />

      {!gameStarted && (
        <View style={styles.overlay}>
          <View style={styles.readyBox}>
            <Text style={styles.readyTitle}>PROTOCOL READY</Text>
            <TouchableOpacity
              style={styles.serveBtn}
              onPress={() => {
                setGameStarted(true);
                resetBall(-1);
              }}
            >
              <Text style={styles.serveText}>TAP TO SERVE</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  background: { ...StyleSheet.absoluteFillObject },

  arenaGrid: { ...StyleSheet.absoluteFillObject, opacity: 0.15 },
  gridLineV: { position: 'absolute', width: 2, height: '100%', backgroundColor: 'rgba(0, 243, 255, 0.3)' },
  centerLine: { position: 'absolute', width: '100%', height: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  centerCircle: {
    position: 'absolute',
    left: SCREEN_WIDTH / 2 - 50,
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },

  topBar: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, zIndex: 100 },
  pauseBtn: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },

weatherBadge: {
  marginLeft: 10,
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 999,
  backgroundColor: 'rgba(0,0,0,0.35)',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.12)',
  maxWidth: 170,
},
weatherText: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '800' },

  centerInfo: { flex: 1, alignItems: 'center' },
  timer: { color: '#00f3ff', fontSize: 28, fontWeight: '900' },
  lowTime: { color: '#ff4b2b' },

  hud: { width: '100%', paddingHorizontal: 30, marginTop: 20 },
  pointsDisplay: { flexDirection: 'row', justifyContent: 'space-between' },
  pBox: { borderLeftWidth: 4, paddingLeft: 10 },
  pLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '900' },
  pScore: { fontSize: 40, fontWeight: '900' },

  paddle: { position: 'absolute', height: PADDLE_HEIGHT, borderRadius: PADDLE_HEIGHT / 2 },
  playerPaddle: { backgroundColor: '#00f3ff', shadowColor: '#00f3ff', shadowRadius: 20, shadowOpacity: 0.9, elevation: 10 },
  aiPaddle: { backgroundColor: '#ff00ff', shadowColor: '#ff00ff', shadowRadius: 20, shadowOpacity: 0.9, elevation: 10 },
  ball: { position: 'absolute', backgroundColor: '#fff', shadowColor: '#fff', shadowRadius: 15, shadowOpacity: 1 },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
  },
  readyBox: { alignItems: 'center' },
  readyTitle: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 5, marginBottom: 30 },
  serveBtn: { paddingHorizontal: 40, paddingVertical: 15, borderRadius: 30, backgroundColor: '#00f3ff' },
  serveText: { color: '#000', fontSize: 18, fontWeight: '900' },
});
