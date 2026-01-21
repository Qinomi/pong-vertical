import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';

// -----------------------------
// Settings Types
// -----------------------------

export type BallSizePreset = 'SMALL' | 'MEDIUM' | 'LARGE';
export type BallSpeedPreset = 'SLOW' | 'NORMAL' | 'FAST';
export type PaddleWidthPreset = 'NARROW' | 'NORMAL' | 'WIDE';
export type PaddleInsetPreset = 'CLOSE' | 'NORMAL' | 'FAR';
export type SpeedupPreset = 'NONE' | 'LOW' | 'NORMAL' | 'HIGH';

// New spice
export type AIDifficultyPreset = 'EASY' | 'NORMAL' | 'HARD' | 'INSANE';
export type BallSpinPreset = 'OFF' | 'LOW' | 'NORMAL' | 'HIGH';

export type Settings = {
  // General
  vibration: boolean;
  sound: boolean;

  // Pong tuning
  ballSize: BallSizePreset;
  ballSpeed: BallSpeedPreset;
  paddleWidth: PaddleWidthPreset;
  paddleInset: PaddleInsetPreset;
  speedupPerHit: SpeedupPreset;

  // New: AI
  aiDifficulty: AIDifficultyPreset;

  // New: physics
  ballSpin: BallSpinPreset;
};

// Backwards-compatible alias (some screens used this older name)
export type GameSettings = Settings;

// -----------------------------
// Presets (numbers live here)
// -----------------------------

export const BALL_SPEEDS = { SLOW: 2.2, NORMAL: 3.5, FAST: 5.5 } as const;
export const BALL_SIZES = { SMALL: 10, MEDIUM: 16, LARGE: 24 } as const;
export const PADDLE_WIDTHS = { NARROW: 100, NORMAL: 140, WIDE: 200 } as const;

// Inset from arena edge (px). Larger = paddles closer to the center.
export const PADDLE_INSETS = { CLOSE: 120, NORMAL: 75, FAR: 30 } as const;

// Each paddle hit multiplies the current |vy| by this factor.
export const SPEEDUP_FACTORS = { NONE: 1.0, LOW: 1.02, NORMAL: 1.05, HIGH: 1.08 } as const;

export const AI_PARAMS = {
  EASY:   { speedPxPerFrame: 2.6, deadzonePx: 18, reactionMs: 140, jitterPx: 26, predictive: false },
  NORMAL: { speedPxPerFrame: 4.0, deadzonePx:  8, reactionMs:  80, jitterPx: 10, predictive: false },
  HARD:   { speedPxPerFrame: 5.6, deadzonePx:  4, reactionMs:  40, jitterPx:  4, predictive: true  },
  INSANE: { speedPxPerFrame: 7.4, deadzonePx:  0, reactionMs:   0, jitterPx:  0, predictive: true  },
} as const;

// How much curve we add (dimensionless scalar). 0 = off.
export const SPIN_STRENGTHS = { OFF: 0.0, LOW: 0.9, NORMAL: 1.6, HIGH: 2.4 } as const;

export type BubbleOption<K extends string> = { key: K; label: string };

export const BALL_SIZE_OPTIONS: readonly BubbleOption<BallSizePreset>[] = [
  { key: 'SMALL', label: 'Small' },
  { key: 'MEDIUM', label: 'Medium' },
  { key: 'LARGE', label: 'Large' },
] as const;

export const BALL_SPEED_OPTIONS: readonly BubbleOption<BallSpeedPreset>[] = [
  { key: 'SLOW', label: 'Slow' },
  { key: 'NORMAL', label: 'Normal' },
  { key: 'FAST', label: 'Fast' },
] as const;

export const PADDLE_WIDTH_OPTIONS: readonly BubbleOption<PaddleWidthPreset>[] = [
  { key: 'NARROW', label: 'Narrow' },
  { key: 'NORMAL', label: 'Normal' },
  { key: 'WIDE', label: 'Wide' },
] as const;

export const PADDLE_INSET_OPTIONS: readonly BubbleOption<PaddleInsetPreset>[] = [
  { key: 'CLOSE', label: 'Close' },
  { key: 'NORMAL', label: 'Normal' },
  { key: 'FAR', label: 'Far' },
] as const;

export const SPEEDUP_OPTIONS: readonly BubbleOption<SpeedupPreset>[] = [
  { key: 'NONE', label: 'None' },
  { key: 'LOW', label: 'Low' },
  { key: 'NORMAL', label: 'Normal' },
  { key: 'HIGH', label: 'High' },
] as const;

export const AI_DIFFICULTY_OPTIONS: readonly BubbleOption<AIDifficultyPreset>[] = [
  { key: 'EASY', label: 'Easy' },
  { key: 'NORMAL', label: 'Normal' },
  { key: 'HARD', label: 'Hard' },
  { key: 'INSANE', label: 'Insane' },
] as const;

export const BALL_SPIN_OPTIONS: readonly BubbleOption<BallSpinPreset>[] = [
  { key: 'OFF', label: 'Off' },
  { key: 'LOW', label: 'Low' },
  { key: 'NORMAL', label: 'Normal' },
  { key: 'HIGH', label: 'High' },
] as const;

export function resolveTuning(s: Settings) {
  const ai = AI_PARAMS[s.aiDifficulty];
  return {
    ballSizePx: BALL_SIZES[s.ballSize],
    ballSpeed: BALL_SPEEDS[s.ballSpeed],
    paddleWidthPx: PADDLE_WIDTHS[s.paddleWidth],
    paddleInsetPx: PADDLE_INSETS[s.paddleInset],
    speedupFactor: SPEEDUP_FACTORS[s.speedupPerHit],

    ai,
    spinStrength: SPIN_STRENGTHS[s.ballSpin],
  };
}

export const DEFAULT_SETTINGS: Settings = {
  vibration: true,
  sound: true,

  ballSize: 'MEDIUM',
  ballSpeed: 'NORMAL',
  paddleWidth: 'NORMAL',
  paddleInset: 'NORMAL',
  speedupPerHit: 'NORMAL',

  aiDifficulty: 'NORMAL',
  ballSpin: 'OFF',
};

// -----------------------------
// Minimal global store
// -----------------------------

const STORAGE_KEY = 'pong_settings_v2';

let _settings: Settings = { ...DEFAULT_SETTINGS };
const _listeners = new Set<() => void>();
let _loadedOnce = false;

function emit() {
  for (const cb of _listeners) cb();
}

function safeParse(json: string | null): any {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function sanitize(maybe: any): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!maybe || typeof maybe !== 'object') return out;

  if (typeof maybe.vibration === 'boolean') out.vibration = maybe.vibration;
  if (typeof maybe.sound === 'boolean') out.sound = maybe.sound;

  if (maybe.ballSize && maybe.ballSize in BALL_SIZES) out.ballSize = maybe.ballSize;
  if (maybe.ballSpeed && maybe.ballSpeed in BALL_SPEEDS) out.ballSpeed = maybe.ballSpeed;
  if (maybe.paddleWidth && maybe.paddleWidth in PADDLE_WIDTHS) out.paddleWidth = maybe.paddleWidth;
  if (maybe.paddleInset && maybe.paddleInset in PADDLE_INSETS) out.paddleInset = maybe.paddleInset;
  if (maybe.speedupPerHit && maybe.speedupPerHit in SPEEDUP_FACTORS) out.speedupPerHit = maybe.speedupPerHit;

  if (maybe.aiDifficulty && maybe.aiDifficulty in AI_PARAMS) out.aiDifficulty = maybe.aiDifficulty;
  if (maybe.ballSpin && maybe.ballSpin in SPIN_STRENGTHS) out.ballSpin = maybe.ballSpin;

  return out;

}

function tryGetLocalStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function tryGetAsyncStorage(): any | null {
  try {
    // Optional dependency. Works if you installed @react-native-async-storage/async-storage.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@react-native-async-storage/async-storage').default;
  } catch {
    return null;
  }
}

async function readStorage(): Promise<string | null> {
  const ls = tryGetLocalStorage();
  if (ls) return ls.getItem(STORAGE_KEY);

  const as = tryGetAsyncStorage();
  if (as) return await as.getItem(STORAGE_KEY);

  return null;
}

async function writeStorage(value: string): Promise<void> {
  const ls = tryGetLocalStorage();
  if (ls) {
    ls.setItem(STORAGE_KEY, value);
    return;
  }

  const as = tryGetAsyncStorage();
  if (as) {
    await as.setItem(STORAGE_KEY, value);
  }
}

async function persist() {
  try {
    await writeStorage(JSON.stringify(_settings));
  } catch {
    // ignore
  }
}

function setAll(next: Settings, doPersist: boolean) {
  _settings = sanitize(next);
  emit();
  if (doPersist) void persist();
}

export async function loadSettingsOnce(): Promise<Settings> {
  if (_loadedOnce) return _settings;
  _loadedOnce = true;

  const raw = await readStorage();
  const parsed = safeParse(raw);
  _settings = sanitize(parsed);
  emit();
  return _settings;
}

export function getSettingsSync(): Settings {
  return _settings;
}

export function updateSettings(patch: Partial<Settings>) {
  setAll({ ..._settings, ...patch }, true);
}

export function resetSettings() {
  setAll({ ...DEFAULT_SETTINGS }, true);
}

export function subscribeSettings(cb: () => void) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettingsSync, getSettingsSync);
}

// -----------------------------
// Compatibility exports
// -----------------------------

export async function loadSettings(): Promise<Settings> {
  return await loadSettingsOnce();
}

export function updateSettingsSync(next: Settings) {
  setAll(next, false);
}

export async function saveSettings(next: Settings): Promise<void> {
  setAll(next, true);
}
