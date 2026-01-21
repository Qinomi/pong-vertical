import { Platform } from 'react-native';

export type GameMode = 'FIRST_TO_5' | 'FIRST_TO_X' | 'TIME_ATTACK';

export interface ScoreEntry {
  id?: number | string;
  name: string;
  mode: GameMode; // FIRST_TO_5 is normalized to FIRST_TO_X

  // FIRST_TO_X: points scored by player/AI
  // TIME_ATTACK: playerScore/timeSpent = seconds survived, aiScore = breaches (0 or 1)
  playerScore: number;
  aiScore: number;

  // FIRST_TO_X
  firstTo?: number;

  // TIME_ATTACK
  timeSpent?: number; // seconds survived
  targetSeconds?: number; // chosen time limit

  createdAt: number; // epoch ms
}

const WEB_KEY = 'pong_scores_v4';

function normalizeMode(mode: GameMode): GameMode {
  return mode === 'FIRST_TO_5' ? 'FIRST_TO_X' : mode;
}

// ---------------------
// Web (localStorage)
// ---------------------

function readWebScores(): ScoreEntry[] {
  try {
    const raw = window.localStorage.getItem(WEB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ScoreEntry[];
  } catch {
    return [];
  }
}

function writeWebScores(scores: ScoreEntry[]) {
  try {
    window.localStorage.setItem(WEB_KEY, JSON.stringify(scores));
  } catch {
    // ignore
  }
}

// ---------------------
// Native (expo-sqlite)
// ---------------------

type SqliteDb = any;

let _dbPromise: Promise<SqliteDb> | null = null;

async function getNativeDb(): Promise<SqliteDb> {
  if (_dbPromise) return _dbPromise;

  _dbPromise = (async () => {
    // Lazy import so web builds don't break
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const SQLite = require('expo-sqlite');

    const db = SQLite.openDatabase('pong_scores.db');

    // expo-sqlite (modern) exposes async exec; older versions do not.
    const execAsync = (sql: string) =>
      new Promise<void>((resolve, reject) => {
        db.exec([{ sql, args: [] }], false, (err: any) => (err ? reject(err) : resolve()));
      });

    // Create
    await execAsync(`
      CREATE TABLE IF NOT EXISTS scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        mode TEXT NOT NULL,
        playerScore INTEGER NOT NULL,
        aiScore INTEGER NOT NULL,
        firstTo INTEGER,
        timeSpent INTEGER,
        targetSeconds INTEGER,
        createdAt INTEGER NOT NULL
      );
    `);

    // Lightweight migrations (ignore if already exists)
    try {
      await execAsync(`ALTER TABLE scores ADD COLUMN firstTo INTEGER;`);
    } catch {}
    try {
      await execAsync(`ALTER TABLE scores ADD COLUMN timeSpent INTEGER;`);
    } catch {}
    try {
      await execAsync(`ALTER TABLE scores ADD COLUMN targetSeconds INTEGER;`);
    } catch {}

    return db;
  })();

  return _dbPromise;
}

async function nativeInsert(entry: ScoreEntry): Promise<void> {
  const db = await getNativeDb();

  return await new Promise<void>((resolve, reject) => {
    db.transaction((tx: any) => {
      tx.executeSql(
        `INSERT INTO scores (name, mode, playerScore, aiScore, firstTo, timeSpent, targetSeconds, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.name,
          normalizeMode(entry.mode),
          entry.playerScore,
          entry.aiScore,
          entry.firstTo ?? null,
          entry.timeSpent ?? null,
          entry.targetSeconds ?? null,
          entry.createdAt,
        ],
        () => resolve(),
        (_: any, err: any) => {
          reject(err);
          return false;
        },
      );
    });
  });
}

async function nativeGetByMode(mode: GameMode, limit = 50): Promise<ScoreEntry[]> {
  const db = await getNativeDb();
  const norm = normalizeMode(mode);

  return await new Promise<ScoreEntry[]>((resolve, reject) => {
    db.transaction((tx: any) => {
      tx.executeSql(
        `SELECT id, name, mode, playerScore, aiScore, firstTo, timeSpent, targetSeconds, createdAt
         FROM scores
         WHERE mode = ?
         ORDER BY createdAt DESC
         LIMIT ?`,
        [norm, limit],
        (_: any, res: any) => {
          const out: ScoreEntry[] = [];
          for (let i = 0; i < res.rows.length; i++) {
            const r = res.rows.item(i);
            out.push({
              id: r.id,
              name: r.name,
              mode: r.mode as GameMode,
              playerScore: r.playerScore,
              aiScore: r.aiScore,
              firstTo: r.firstTo ?? undefined,
              timeSpent: r.timeSpent ?? undefined,
              targetSeconds: r.targetSeconds ?? undefined,
              createdAt: r.createdAt,
            });
          }
          resolve(out);
        },
        (_: any, err: any) => {
          reject(err);
          return false;
        },
      );
    });
  });
}

async function nativeGetTop(limit = 50): Promise<ScoreEntry[]> {
  const db = await getNativeDb();

  return await new Promise<ScoreEntry[]>((resolve, reject) => {
    db.transaction((tx: any) => {
      tx.executeSql(
        `SELECT id, name, mode, playerScore, aiScore, firstTo, timeSpent, targetSeconds, createdAt
         FROM scores
         ORDER BY createdAt DESC
         LIMIT ?`,
        [limit],
        (_: any, res: any) => {
          const out: ScoreEntry[] = [];
          for (let i = 0; i < res.rows.length; i++) {
            const r = res.rows.item(i);
            out.push({
              id: r.id,
              name: r.name,
              mode: r.mode as GameMode,
              playerScore: r.playerScore,
              aiScore: r.aiScore,
              firstTo: r.firstTo ?? undefined,
              timeSpent: r.timeSpent ?? undefined,
              targetSeconds: r.targetSeconds ?? undefined,
              createdAt: r.createdAt,
            });
          }
          resolve(out);
        },
        (_: any, err: any) => {
          reject(err);
          return false;
        },
      );
    });
  });
}

// ---------------------
// Public API
// ---------------------

export async function saveScoreEntry(input: Omit<ScoreEntry, 'createdAt'>): Promise<void> {
  const entry: ScoreEntry = {
    ...input,
    mode: normalizeMode(input.mode),
    createdAt: Date.now(),
  };

  if (Platform.OS === 'web') {
    const scores = readWebScores();
    scores.unshift(entry);
    writeWebScores(scores.slice(0, 200));
    return;
  }

  await nativeInsert(entry);
}

export async function getScoresByMode(mode: GameMode, limit = 50): Promise<ScoreEntry[]> {
  if (Platform.OS === 'web') {
    const scores = readWebScores().filter((s) => normalizeMode(s.mode) === normalizeMode(mode));
    return scores.slice(0, limit);
  }
  return await nativeGetByMode(mode, limit);
}

export async function getTopScores(limit = 50): Promise<ScoreEntry[]> {
  if (Platform.OS === 'web') {
    return readWebScores().slice(0, limit);
  }
  return await nativeGetTop(limit);
}
