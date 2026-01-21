import { getSettingsSync, resolveTuning, subscribeSettings } from '@/lib/settings';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, PanResponder, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// NOTE: We measure the actual rendered height of the game container via onLayout.
// Using a hard-coded fraction (like 0.8) can make the bottom paddle look "too high"
// compared to the top paddle on different screens / web.
const DEFAULT_ARENA_HEIGHT = SCREEN_HEIGHT;
const PADDLE_HEIGHT = 18;
const MAX_BALL_SPEED = 12;

const DEFAULT_TIME_ATTACK_SECONDS = 60;

// --- Live API modifier (Free, no key): Open-Meteo current weather ---
// Small gameplay influences:
// - Temperature affects serve speed (hot = faster, cold = slower)
// - Wind adds a gentle horizontal drift to the ball
// - Stormy codes make the AI slightly more aggressive
// Open-Meteo is free and does not require an API key.
const WEATHER_CITY = 'Bangkok';
const WEATHER_LAT = 13.7563;
const WEATHER_LON = 100.5018;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.trunc(v)));

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

// --- Mobile spice modifier: Battery level ---
// Idea: high battery => the arena is "amped" (slightly harder); low battery => slightly calmer.
// This only affects gameplay on native platforms. On web it stays neutral.
type BatteryMod = {
  level: number | null; // 0..1
  label: string;
  speedMul: number;
  aiMul: number;
  windMul: number;
};

function computeBatteryMod(level: number | null): BatteryMod {
  if (typeof level !== 'number' || !Number.isFinite(level)) {
    return { level: null, label: 'BAT ?', speedMul: 1, aiMul: 1, windMul: 1 };
  }

  const pct = clamp(level, 0, 1);
  const centered = (pct - 0.5) * 2; // -1..+1

  // Keep these subtle — just “spice”, not unplayable.
  const aiMul = clamp(1 + centered * 0.10, 0.90, 1.10);
  const speedMul = clamp(1 + centered * 0.06, 0.92, 1.08);
  const windMul = clamp(1 + centered * 0.10, 0.90, 1.10);

  const label = `BAT ${Math.round(pct * 100)}%`;
  return { level: pct, label, speedMul, aiMul, windMul };
}

export type GameMode = 'FIRST_TO_5' | 'FIRST_TO_X' | 'TIME_ATTACK';

export interface GameResult {
  playerScore: number;
  aiScore: number;
  mode: GameMode;

  firstTo?: number;

  // TIME_ATTACK
  timeSpent?: number; // seconds survived
  targetSeconds?: number; // the chosen time limit
}

interface PongGameProps {
  mode: GameMode;
  firstTo?: number;
  targetSeconds?: number;

  onGameOver: (result: GameResult) => void;
  onPausePress: () => void;
  onOptionsPress: () => void;
  isExternalPaused: boolean;
}

export const PongGame: React.FC<PongGameProps> = ({
  mode,
  firstTo,
  targetSeconds,
  onGameOver,
  onPausePress,
  onOptionsPress,
  isExternalPaused,
}) => {
  const isFocused = useIsFocused();

  const scoreLimit = useMemo(() => {
    if (mode === 'FIRST_TO_5') return 5;
    if (mode === 'FIRST_TO_X') {
      const raw = typeof firstTo === 'number' && Number.isFinite(firstTo) ? firstTo : 5;
      return clampInt(raw, 1, 99);
    }
    return null;
  }, [mode, firstTo]);

  const timeLimit = useMemo(() => {
    const raw = typeof targetSeconds === 'number' && Number.isFinite(targetSeconds) ? targetSeconds : DEFAULT_TIME_ATTACK_SECONDS;
    return clampInt(raw, 10, 999);
  }, [targetSeconds]);

  const [arenaH, setArenaH] = useState(DEFAULT_ARENA_HEIGHT);

  // Game State
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  const [gameStarted, setGameStarted] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Keep timer ref in sync
  const timeLeftRef = useRef(timeLeft);
  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  // Reset match state when switching mode or time limit / score limit.
  useEffect(() => {
    setPlayerScore(0);
    setAiScore(0);
    setGameStarted(false);
    setIsResetting(false);
    if (mode === 'TIME_ATTACK') setTimeLeft(timeLimit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, scoreLimit, timeLimit]);

  const gameOverOnceRef = useRef(false);
  useEffect(() => {
    if (gameStarted) gameOverOnceRef.current = false;
  }, [gameStarted, mode, scoreLimit, timeLimit]);

  // -----------------------------
  // Live API modifier (Open-Meteo)
  // -----------------------------
  const weatherModRef = useRef<WeatherMod>(
    computeWeatherMod({ city: WEATHER_CITY, tempC: null, windMS: null, windDirDeg: null, code: null }),
  );
  const [weatherMod, setWeatherMod] = useState<WeatherMod>(() => weatherModRef.current);
  const [weatherOnline, setWeatherOnline] = useState<boolean>(true);
  const [wxTipVisible, setWxTipVisible] = useState(false);

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
          setWeatherMod(mod);
          setWeatherOnline(true);
        }
      } catch {
        weatherModRef.current = computeWeatherMod({
          city: WEATHER_CITY,
          tempC: null,
          windMS: null,
          windDirDeg: null,
          code: null,
        });
        if (!cancelled) {
          setWeatherMod(weatherModRef.current);
          setWeatherOnline(false);
        }
      }
    };

    syncWeather();
    const id = setInterval(syncWeather, 5 * 60 * 1000); // refresh every 5 minutes
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // -----------------------------
  // Battery spice (native only)
  // -----------------------------
  const batteryModRef = useRef<BatteryMod>(computeBatteryMod(null));
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let subscription: any = null;

    const start = async () => {
      // Web: keep neutral, no dependency
      if (Platform.OS === 'web') return;

      try {
        // Dynamic import: app runs even if expo-battery isn't installed.
        const Battery = await import('expo-battery');
        const lvl = await Battery.getBatteryLevelAsync();
        if (!cancelled) setBatteryLevel(typeof lvl === 'number' ? lvl : null);

        subscription = Battery.addBatteryLevelListener((e: any) => {
          const v = e?.batteryLevel;
          setBatteryLevel(typeof v === 'number' ? v : null);
        });
      } catch {
        // If expo-battery isn't available, just stay neutral.
        if (!cancelled) setBatteryLevel(null);
      }
    };

    start();

    return () => {
      cancelled = true;
      subscription?.remove?.();
    };
  }, []);

  const batteryMod = useMemo(() => computeBatteryMod(batteryLevel), [batteryLevel]);
  useEffect(() => {
    batteryModRef.current = batteryMod;
  }, [batteryMod]);

  const weatherPillText = useMemo(() => {
    if (!weatherOnline) return 'WX: OFFLINE';

    const tStr = weatherMod.tempC === null ? '?' : Math.round(weatherMod.tempC).toString();
    const wStr = weatherMod.windMS === null ? '?' : weatherMod.windMS.toFixed(1);
    const batStr = batteryMod.level === null ? '' : ` • ${batteryMod.label}`;
    return `WX ${weatherMod.label} ${tStr}°C W${wStr}${batStr}`;
  }, [weatherOnline, weatherMod, batteryMod]);

  const weatherEffectLines = useMemo(() => {
    const lines: string[] = [];
    if (!weatherOnline) {
      lines.push('No weather effects (offline).');
    }

    const wx = weatherMod;
    const bat = batteryMod;

    const combinedSpeed = clamp(wx.speedMul * bat.speedMul, 0.80, 1.35);
    const combinedAi = clamp(wx.aiMul * bat.aiMul, 0.80, 1.35);
    const combinedWind = clamp(wx.windPushX * bat.windMul, -0.22, 0.22);

    const fmtPct = (mul: number) => {
      const d = Math.round((mul - 1) * 100);
      return `${d >= 0 ? '+' : ''}${d}%`;
    };

    lines.push(`Ball speed: ${fmtPct(combinedSpeed)} (WX ${fmtPct(wx.speedMul)}, BAT ${fmtPct(bat.speedMul)})`);
    lines.push(`AI speed: ${fmtPct(combinedAi)} (WX ${fmtPct(wx.aiMul)}, BAT ${fmtPct(bat.aiMul)})`);

    if (Math.abs(combinedWind) < 0.005) lines.push('Wind drift: 0');
    else {
      const dir = combinedWind > 0 ? '→' : '←';
      lines.push(`Wind drift: ${combinedWind > 0 ? '+' : ''}${combinedWind.toFixed(3)} px/frame ${dir}`);
    }

    if (bat.level === null) lines.push('Battery spice: neutral (no battery API).');
    else lines.push(`Battery spice: ${bat.label}`);

    lines.push(`Preset: ${wx.label}`);
    return lines;
  }, [weatherOnline, weatherMod, batteryMod]);

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

  const resetBall = useCallback(
    (serveDirection: number) => {
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
        const wx = weatherModRef.current;
        const bat = batteryModRef.current;

        const baseSpeed = t.ballSpeed * wx.speedMul * bat.speedMul;
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
    },
    [arenaH],
  );

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
    }),
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

    const wx = weatherModRef.current;
    const bat = batteryModRef.current;

    ballPos.current.x += ballVel.current.x;
    ballPos.current.y += ballVel.current.y;

    // Weather drift (+ battery spice)
    ballPos.current.x += wx.windPushX * bat.windMul;

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

    // Score / Time Attack rules
    if (mode === 'TIME_ATTACK') {
      if (ballPos.current.y < 0) {
        // In Time Attack, points come from survival time, not scoring on the AI.
        resetBall(1);
      } else if (ballPos.current.y > arenaH) {
        // Breach: you failed to return the ball.
        if (!gameOverOnceRef.current) {
          gameOverOnceRef.current = true;
          const survived = clamp(timeLimit - timeLeftRef.current, 0, timeLimit);
          setAiScore(1);
          setGameStarted(false);
          onGameOver({ playerScore: survived, aiScore: 1, mode, timeSpent: survived, targetSeconds: timeLimit });
        }
        requestRef.current = requestAnimationFrame(update);
        return;
      }
    } else {
      if (ballPos.current.y < 0) {
        setPlayerScore((s) => s + 1);
        resetBall(1);
      } else if (ballPos.current.y > arenaH) {
        setAiScore((s) => s + 1);
        resetBall(-1);
      }
    }

    // AI movement
    const aiTarget = ballPos.current.x + ballSize / 2 - paddleW / 2;
    const baseAiSpeed = mode === 'TIME_ATTACK' ? 5.2 : 4.0;
    const aiSpeed = baseAiSpeed * wx.aiMul * bat.aiMul;

    if (Math.abs(aiX.current - aiTarget) > 5) {
      if (aiX.current < aiTarget) aiX.current += aiSpeed;
      else aiX.current -= aiSpeed;
    }

    aiX.current = clamp(aiX.current, 0, SCREEN_WIDTH - paddleW);

    updateStyle(ballRef, { left: ballPos.current.x, top: ballPos.current.y });
    updateStyle(aiRef, { left: aiX.current });

    requestRef.current = requestAnimationFrame(update);
  }, [isFocused, gameStarted, isExternalPaused, isResetting, mode, resetBall, arenaH, onGameOver, timeLimit]);

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
    if (mode !== 'TIME_ATTACK') return;
    if (!isFocused || !gameStarted || isExternalPaused) return;
    if (gameOverOnceRef.current) return;

    const timer = setInterval(() => {
      setTimeLeft((t) => (t > 0 ? t - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [mode, isFocused, gameStarted, isExternalPaused]);

  useEffect(() => {
    if ((mode === 'FIRST_TO_5' || mode === 'FIRST_TO_X') && scoreLimit !== null && (playerScore >= scoreLimit || aiScore >= scoreLimit)) {
      setGameStarted(false);
      onGameOver({ playerScore, aiScore, mode, firstTo: scoreLimit });
    } else if (mode === 'TIME_ATTACK' && timeLeft <= 0) {
      if (!gameOverOnceRef.current) {
        gameOverOnceRef.current = true;
        setGameStarted(false);
        onGameOver({ playerScore: timeLimit, aiScore: 0, mode, timeSpent: timeLimit, targetSeconds: timeLimit });
      }
    }
  }, [playerScore, aiScore, timeLeft, mode, scoreLimit, onGameOver, timeLimit]);

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

  const survivedSoFar = mode === 'TIME_ATTACK' ? clamp(timeLimit - timeLeft, 0, timeLimit) : playerScore;

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
        <View style={styles.topRow}>
          <View style={styles.leftCluster}>
            <TouchableOpacity onPress={onPausePress} style={styles.pauseBtn}>
              <Ionicons name="pause" size={24} color="#fff" />
            </TouchableOpacity>

            <Pressable
              onHoverIn={() => setWxTipVisible(true)}
              onHoverOut={() => setWxTipVisible(false)}
              onPress={() => setWxTipVisible((v) => !v)}
              style={styles.weatherBadge}
            >
              <Text style={styles.weatherText} numberOfLines={1}>
                {weatherPillText}
              </Text>

              {wxTipVisible && (
                <View style={styles.weatherTooltip}>
                  {weatherEffectLines.map((line, idx) => (
                    <Text key={idx} style={styles.weatherTooltipText}>
                      {line}
                    </Text>
                  ))}
                </View>
              )}
            </Pressable>
          </View>

          {mode === 'TIME_ATTACK' && (
            <View pointerEvents="none" style={styles.timerCenter}>
              <Text style={[styles.timer, timeLeft < 10 && styles.lowTime]}>{timeLeft}s</Text>
            </View>
          )}

          <View style={styles.rightCluster}>
            <TouchableOpacity onPress={onOptionsPress} style={styles.pauseBtn}>
              <Ionicons name="options" size={24} color="#00f3ff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.hud}>
        <View style={styles.pointsDisplay}>
          <View style={[styles.pBox, styles.pBoxLeft, { borderLeftColor: '#ff00ff' }]}>
            <Text style={styles.pLabel}>{mode === 'TIME_ATTACK' ? 'BREACH' : 'AI'}</Text>
            <Text style={[styles.pScore, { color: '#ff00ff' }]}>{aiScore}</Text>
          </View>

          <View style={[styles.pBox, styles.pBoxRight, { borderRightColor: '#00f3ff', alignItems: 'flex-end' }]}>
            <Text style={styles.pLabel}>YOU</Text>
            <Text style={[styles.pScore, { color: '#00f3ff' }]}>{survivedSoFar}</Text>
          </View>
        </View>

        {mode === 'TIME_ATTACK' && (
          <Text style={styles.targetHint}>TARGET: {timeLimit}s</Text>
        )}
      </View>

      <View ref={aiRef} style={[styles.paddle, styles.aiPaddle, { top: aiY, left: aiX.current, width: t.paddleWidthPx }]} />
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
      <View ref={playerRef} style={[styles.paddle, styles.playerPaddle, { top: playerY, left: playerX.current, width: t.paddleWidthPx }]} />

      {!gameStarted && (
        <View style={styles.overlay}>
          <View style={styles.readyBox}>
            <Text style={styles.readyTitle}>PROTOCOL READY</Text>
            <TouchableOpacity
              style={styles.serveBtn}
              onPress={() => {
                if (mode === 'TIME_ATTACK') setTimeLeft(timeLimit);
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

  topBar: { paddingTop: 60, paddingHorizontal: 20, zIndex: 100 },
  topRow: { height: 44, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  leftCluster: { position: 'absolute', left: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rightCluster: { position: 'absolute', right: 0 },
  timerCenter: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },

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
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    maxWidth: 210,
    position: 'relative',
  },
  weatherText: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '800' },
  weatherTooltip: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    zIndex: 2000,
    minWidth: 230,
  },
  weatherTooltipText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginBottom: 4,
  },

  timer: { color: '#00f3ff', fontSize: 28, fontWeight: '900' },
  lowTime: { color: '#ff4b2b' },

  hud: { width: '100%', paddingHorizontal: 30, marginTop: 20 },
  pointsDisplay: { flexDirection: 'row', justifyContent: 'space-between' },
  pBox: { flex: 1 },
  pBoxLeft: { borderLeftWidth: 4, paddingLeft: 10, alignItems: 'flex-start' },
  pBoxRight: { borderRightWidth: 4, paddingRight: 10, alignItems: 'flex-end' },
  pLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '900' },
  pScore: { fontSize: 40, fontWeight: '900' },
  targetHint: { marginTop: 8, textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '900', letterSpacing: 2 },

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
