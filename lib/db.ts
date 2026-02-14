import {
  firebaseDeleteFirstToXScore,
  firebaseDeleteTimeAttackScore,
  firebaseGetFirstToXScores,
  firebaseGetTimeAttackScores,
  firebaseSaveFirstToXScore,
  firebaseSaveTimeAttackScore,
} from './firebase';
import { createInitialProfile, getUserProfile as getFirestorePlayerById, incrementUserWin } from './firestore-user';
import { checkNetworkStatus } from './network';
import {
  initDatabase,
  sqliteDeleteFirstToXScore,
  sqliteDeleteTimeAttackScore,
  sqliteGetFirstToXScores,
  sqliteGetPendingDeletedScoreIds,
  sqliteGetTimeAttackScores,
  sqliteMarkFirstToXSynced,
  sqliteMarkTimeAttackSynced,
  sqliteQueuePendingDeletedScore,
  sqliteRemovePendingDeletedScore,
  sqliteSaveFirstToXScore,
  sqliteSaveTimeAttackScore,
} from './sqlite';

// Initialize SQLite on app start
initDatabase().catch(console.error);

// =============================================================================
// Types
// =============================================================================

export interface Player {
  player_id: number | string;
  player_name: string;
  player_created_date: number; // epoch ms
  count_win: number;
  count_lose: number;
}

export interface ScoreFirstToX {
  score01_id: string;
  player_id: string; // FK - Player 1 (current user)
  player_id1: string; // FK - Player 2 (opponent or AI=1)
  score01_player: number; // Player 1's score
  score01_player1: number; // Player 2's score
  score01_winner: string; // player_id of winner
  score01_time_elapse: number; // seconds
  score01_target?: number; // target score (e.g. 3/5/7/10)
  score01_created_date: number; // epoch ms
}

export interface ScoreTimeAttackX {
  score02_id: string;
  player_id: string; // FK - Player
  score02_verdict: string; // 'WIN' | 'LOSE'
  score02_time_duration: number; // seconds survived
  score02_target_seconds?: number; // configured time target
  score02_created_date: number; // epoch ms
}

// Computer AI player ID (Firestore ID)
export const AI_PLAYER_ID = 'ai_computer';

function mergeFirstToXScores(
  localScores: ScoreFirstToX[],
  remoteScores: ScoreFirstToX[],
  limit: number
): ScoreFirstToX[] {
  const map = new Map<string, ScoreFirstToX>();

  for (const item of localScores) {
    if (!item.score01_id) continue;
    map.set(item.score01_id, item);
  }

  for (const item of remoteScores) {
    if (!item.score01_id) continue;
    map.set(item.score01_id, item);
  }

  return [...map.values()]
    .sort((a, b) => b.score01_created_date - a.score01_created_date)
    .slice(0, limit);
}

function mergeTimeAttackScores(
  localScores: ScoreTimeAttackX[],
  remoteScores: ScoreTimeAttackX[],
  limit: number
): ScoreTimeAttackX[] {
  const map = new Map<string, ScoreTimeAttackX>();

  for (const item of localScores) {
    if (!item.score02_id) continue;
    map.set(item.score02_id, item);
  }

  for (const item of remoteScores) {
    if (!item.score02_id) continue;
    map.set(item.score02_id, item);
  }

  return [...map.values()]
    .sort((a, b) => b.score02_created_date - a.score02_created_date)
    .slice(0, limit);
}

async function syncPendingDeletedScoresIfOnline(): Promise<void> {
  const online = await checkNetworkStatus();
  if (!online) return;

  const [pendingFirstToXIds, pendingTimeAttackIds] = await Promise.all([
    sqliteGetPendingDeletedScoreIds('first_to_x'),
    sqliteGetPendingDeletedScoreIds('time_attack'),
  ]);

  for (const scoreId of pendingFirstToXIds) {
    const ok = await firebaseDeleteFirstToXScore(scoreId);
    if (ok) {
      await sqliteRemovePendingDeletedScore(scoreId, 'first_to_x');
    }
  }

  for (const scoreId of pendingTimeAttackIds) {
    const ok = await firebaseDeleteTimeAttackScore(scoreId);
    if (ok) {
      await sqliteRemovePendingDeletedScore(scoreId, 'time_attack');
    }
  }
}

async function cacheRemoteFirstToXScores(remoteScores: ScoreFirstToX[]): Promise<void> {
  await Promise.all(
    remoteScores
      .filter((item) => !!item.score01_id)
      .map(async (item) => {
        try {
          await sqliteSaveFirstToXScore({
            score01_id: item.score01_id,
            player_id: item.player_id,
            player_id1: item.player_id1,
            score01_player: item.score01_player,
            score01_player1: item.score01_player1,
            score01_winner: item.score01_winner,
            score01_time_elapse: item.score01_time_elapse,
            score01_target: item.score01_target,
            score01_created_date: item.score01_created_date,
          });
          await sqliteMarkFirstToXSynced(item.score01_id);
        } catch (error) {
          console.warn('Failed to cache FirstToX score locally:', error);
        }
      })
  );
}

async function cacheRemoteTimeAttackScores(remoteScores: ScoreTimeAttackX[]): Promise<void> {
  await Promise.all(
    remoteScores
      .filter((item) => !!item.score02_id)
      .map(async (item) => {
        try {
          await sqliteSaveTimeAttackScore({
            score02_id: item.score02_id,
            player_id: item.player_id,
            score02_verdict: item.score02_verdict,
            score02_time_duration: item.score02_time_duration,
            score02_target_seconds: item.score02_target_seconds,
            score02_created_date: item.score02_created_date,
          });
          await sqliteMarkTimeAttackSynced(item.score02_id);
        } catch (error) {
          console.warn('Failed to cache TimeAttack score locally:', error);
        }
      })
  );
}

// =============================================================================
// Player Functions
// =============================================================================

export async function createOrGetPlayer(name: string, docId?: string): Promise<Player> {
  // If we have a specific docId (Auth UID), use it.
  // Otherwise, fallback to a name-based ID for guests.
  const userId = docId || `guest_${name.replace(/\s+/g, '_').toLowerCase()}`;

  // Check if profile exists
  let profile = await getFirestorePlayerById(userId);

  if (!profile) {
    // Create it
    await createInitialProfile(userId, name);
    // Construct fallback profile when offline or Firestore unavailable
    profile = {
      uid: userId,
      displayName: name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      count_win: 0,
    };
  }

  return {
    player_id: profile.uid,
    player_name: profile.displayName,
    player_created_date: profile.createdAt,
    count_win: profile.count_win || 0,
    count_lose: 0, // Not explicitly tracked in UserProfile yet
  };
}

export async function updatePlayerStats(playerId: number | string, isWin: boolean): Promise<void> {
  if (typeof playerId === 'string' && playerId !== AI_PLAYER_ID) {
    if (isWin) {
      await incrementUserWin(playerId);
    }
  }
}

export async function getPlayerById(playerId: number | string): Promise<Player | null> {
  if (playerId === AI_PLAYER_ID) {
    return {
      player_id: AI_PLAYER_ID,
      player_name: 'COMPUTER',
      player_created_date: 0,
      count_win: 0,
      count_lose: 0,
    };
  }

  try {
    const p = await getFirestorePlayerById(String(playerId));
    if (p) {
      return {
        player_id: p.uid,
        player_name: p.displayName,
        player_created_date: p.createdAt,
        count_win: p.count_win || 0,
        count_lose: 0,
      };
    }
  } catch {
    // Ignore and use fallback below
  }

  return null;
}

export async function getAllPlayers(): Promise<Player[]> {
  return []; // Not implemented/needed for current UI
}

// =============================================================================
// Score_FirstToX Functions
// =============================================================================

export interface SaveFirstToXInput {
  playerId: number | string; // Player 1
  opponentId: number | string; // Player 2 (AI = 1)
  playerScore: number;
  opponentScore: number;
  winnerId: number | string;
  timeElapsed: number; // seconds
  targetScore?: number;
  isOnline?: boolean;
}

export async function saveFirstToXScore(input: SaveFirstToXInput): Promise<void> {
  const scoreId = `ftx_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const createdDate = Date.now();

  // 1. Save to SQLite first (Local Database)
  try {
    await sqliteSaveFirstToXScore({
      score01_id: scoreId,
      player_id: String(input.playerId),
      player_id1: String(input.opponentId),
      score01_player: input.playerScore,
      score01_player1: input.opponentScore,
      score01_winner: String(input.winnerId),
      score01_time_elapse: input.timeElapsed,
      score01_target: input.targetScore,
      score01_created_date: createdDate,
    });
    console.log('Saved to SQLite:', scoreId);
  } catch (error) {
    console.warn('SQLite save failed:', error);
  }

  // 2. Save to Firebase (Online Database)
  try {
    await firebaseSaveFirstToXScore(
      {
        player_id: String(input.playerId),
        player_id1: String(input.opponentId),
        score01_player: input.playerScore,
        score01_player1: input.opponentScore,
        score01_winner: String(input.winnerId),
        score01_time_elapse: input.timeElapsed,
        score01_target: input.targetScore,
        score01_created_date: createdDate,
        is_online: input.isOnline || false,
      },
      scoreId
    );

    // Mark as synced in SQLite
    await sqliteMarkFirstToXSynced(scoreId);
    console.log('Synced to Firebase:', scoreId);
  } catch (error) {
    console.warn('Firebase sync failed (will retry later):', error);
  }
}

export async function getFirstToXScores(playerId?: number | string, limit = 50): Promise<ScoreFirstToX[]> {
  const pid = playerId ? String(playerId) : undefined;
  const local = await sqliteGetFirstToXScores(pid, limit);

  const isOnline = await checkNetworkStatus();
  if (isOnline) {
    await syncPendingDeletedScoresIfOnline();
  }

  const pendingDeletedIds = new Set(await sqliteGetPendingDeletedScoreIds('first_to_x'));
  const filteredLocal = local.filter((item) => !pendingDeletedIds.has(item.score01_id));

  if (!isOnline) {
    return filteredLocal.map((s) => ({ ...s }));
  }

  const remote = await firebaseGetFirstToXScores(undefined, pid);
  const mappedRemote = remote
    .map((s) => ({ ...s, score01_id: s.score01_id || '' }))
    .filter((item) => !pendingDeletedIds.has(item.score01_id));
  await cacheRemoteFirstToXScores(mappedRemote);

  return mergeFirstToXScores(filteredLocal, mappedRemote, limit);
}

// =============================================================================
// Score_TimeAttackX Functions
// =============================================================================

export interface SaveTimeAttackInput {
  playerId: number | string;
  verdict: 'WIN' | 'LOSE';
  timeDuration: number; // seconds survived
  targetSeconds?: number;
  isOnline?: boolean;
}

export async function saveTimeAttackScore(input: SaveTimeAttackInput): Promise<void> {
  const scoreId = `ta_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const createdDate = Date.now();

  // 1. Save to SQLite first (Local Database)
  try {
    await sqliteSaveTimeAttackScore({
      score02_id: scoreId,
      player_id: String(input.playerId),
      score02_verdict: input.verdict,
      score02_time_duration: input.timeDuration,
      score02_target_seconds: input.targetSeconds,
      score02_created_date: createdDate,
    });
    console.log('Saved TimeAttack to SQLite:', scoreId);
  } catch (error) {
    console.warn('SQLite save failed:', error);
  }

  // 2. Save to Firebase (Online Database)
  try {
    await firebaseSaveTimeAttackScore(
      {
        player_id: String(input.playerId),
        score02_verdict: input.verdict,
        score02_time_duration: input.timeDuration,
        score02_target_seconds: input.targetSeconds,
        score02_created_date: createdDate,
        is_online: input.isOnline || false,
      },
      scoreId
    );

    // Mark as synced in SQLite
    await sqliteMarkTimeAttackSynced(scoreId);
    console.log('Synced TimeAttack to Firebase:', scoreId);
  } catch (error) {
    console.warn('Firebase sync failed (will retry later):', error);
  }
}

export async function getTimeAttackScores(playerId?: number | string, limit = 50): Promise<ScoreTimeAttackX[]> {
  const pid = playerId ? String(playerId) : undefined;
  const local = await sqliteGetTimeAttackScores(pid, limit);

  const isOnline = await checkNetworkStatus();
  if (isOnline) {
    await syncPendingDeletedScoresIfOnline();
  }

  const pendingDeletedIds = new Set(await sqliteGetPendingDeletedScoreIds('time_attack'));
  const filteredLocal = local.filter((item) => !pendingDeletedIds.has(item.score02_id));

  if (!isOnline) {
    return filteredLocal.map((s) => ({ ...s }));
  }

  const remote = await firebaseGetTimeAttackScores(undefined, pid);
  const mappedRemote = remote
    .map((s) => ({ ...s, score02_id: s.score02_id || '' }))
    .filter((item) => !pendingDeletedIds.has(item.score02_id));
  await cacheRemoteTimeAttackScores(mappedRemote);

  return mergeTimeAttackScores(filteredLocal, mappedRemote, limit);
}

export async function deleteHistoryScoreByMode(
  mode: 'FIRST_TO_X' | 'TIME_ATTACK',
  scoreId: string
): Promise<void> {
  if (mode === 'TIME_ATTACK') {
    await sqliteDeleteTimeAttackScore(scoreId);
    const deleted = await firebaseDeleteTimeAttackScore(scoreId);
    if (deleted) {
      await sqliteRemovePendingDeletedScore(scoreId, 'time_attack');
    } else {
      await sqliteQueuePendingDeletedScore(scoreId, 'time_attack');
    }
  } else {
    await sqliteDeleteFirstToXScore(scoreId);
    const deleted = await firebaseDeleteFirstToXScore(scoreId);
    if (deleted) {
      await sqliteRemovePendingDeletedScore(scoreId, 'first_to_x');
    } else {
      await sqliteQueuePendingDeletedScore(scoreId, 'first_to_x');
    }
  }

  void syncPendingDeletedScoresIfOnline();
}

// =============================================================================
// Legacy compatibility
// =============================================================================

export type GameMode = 'FIRST_TO_5' | 'FIRST_TO_X' | 'TIME_ATTACK';

export interface ScoreEntry {
  id?: number | string;
  name: string;
  mode: GameMode;
  playerScore: number;
  aiScore: number;
  firstTo?: number;
  timeSpent?: number;
  targetSeconds?: number;
  createdAt: number;
}

export async function saveScoreEntry(input: Omit<ScoreEntry, 'createdAt'> & { userId?: string; isOnline?: boolean }): Promise<void> {
  // Get or create player
  const player = await createOrGetPlayer(input.name, input.userId); // Pass userId if available

  if (input.mode === 'TIME_ATTACK') {
    const isWin = input.aiScore === 0;
    await saveTimeAttackScore({
      playerId: player.player_id,
      verdict: isWin ? 'WIN' : 'LOSE',
      timeDuration: input.timeSpent ?? input.playerScore,
      isOnline: input.isOnline,
    });
    if (isWin) await incrementUserWin(String(player.player_id));
  } else {
    // FIRST_TO_5 or FIRST_TO_X
    const isWin = input.playerScore > input.aiScore;
    await saveFirstToXScore({
      playerId: player.player_id,
      opponentId: AI_PLAYER_ID,
      playerScore: input.playerScore,
      opponentScore: input.aiScore,
      winnerId: isWin ? player.player_id : AI_PLAYER_ID,
      timeElapsed: input.timeSpent ?? 0,
      isOnline: input.isOnline,
    });
    // Ensure incrementUserWin is called for human player wins
    if (isWin) await incrementUserWin(String(player.player_id));
  }
}

export async function getScoresByMode(mode: GameMode, limit = 50, userId?: string): Promise<ScoreEntry[]> {
  if (mode === 'TIME_ATTACK') {
    const scores = await getTimeAttackScores(userId, limit);
    const entries: ScoreEntry[] = [];

    for (const s of scores) {
      const winnerId = s.score02_verdict === 'WIN' ? s.player_id : AI_PLAYER_ID;
      const winner = await getPlayerById(winnerId);
      entries.push({
        id: s.score02_id,
        name: winner?.player_name ?? (winnerId === AI_PLAYER_ID ? 'COMPUTER' : userId && winnerId === userId ? 'YOU' : 'Unknown'),
        mode: 'TIME_ATTACK',
        playerScore: s.score02_time_duration,
        aiScore: s.score02_verdict === 'WIN' ? 0 : 1,
        timeSpent: s.score02_time_duration,
        targetSeconds: s.score02_target_seconds,
        createdAt: s.score02_created_date,
      });
    }
    return entries;
  }

  // FIRST_TO_X
  const scores = await getFirstToXScores(userId, limit);
  const entries: ScoreEntry[] = [];

  for (const s of scores) {
    const winnerId = s.score01_winner;
    const winner = await getPlayerById(winnerId);

    // Default assumption: I am Player 1
    let myScore = s.score01_player;
    let oppScore = s.score01_player1;

    // If I am Player 2, swap views
    if (userId && s.player_id1 === userId) {
      myScore = s.score01_player1;
      oppScore = s.score01_player;
    }

    entries.push({
      id: s.score01_id,
      name: winner?.player_name ?? (winnerId === AI_PLAYER_ID ? 'COMPUTER' : userId && winnerId === userId ? 'YOU' : 'Unknown'),
      mode: 'FIRST_TO_X',
      playerScore: myScore,
      aiScore: oppScore,
      firstTo: s.score01_target ?? Math.max(s.score01_player, s.score01_player1),
      createdAt: s.score01_created_date,
    });
  }
  return entries;
}

export async function getTopScores(limit = 50): Promise<ScoreEntry[]> {
  const firstToX = await getScoresByMode('FIRST_TO_X', limit);
  const timeAttack = await getScoresByMode('TIME_ATTACK', limit);

  return [...firstToX, ...timeAttack].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}
