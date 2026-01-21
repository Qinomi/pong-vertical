import {
  firebaseGetFirstToXScores,
  firebaseGetTimeAttackScores,
  firebaseSaveFirstToXScore,
  firebaseSaveTimeAttackScore
} from './firebase';
import { createInitialProfile, getUserProfile as getFirestorePlayerById, incrementUserWin } from './firestore-user';

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
  player_id: string;       // FK - Player 1 (current user)
  player_id1: string;      // FK - Player 2 (opponent or AI=1)
  score01_player: number;  // Player 1's score
  score01_player1: number; // Player 2's score
  score01_winner: string;  // player_id of winner
  score01_time_elapse: number; // seconds
  score01_created_date: number; // epoch ms
}

export interface ScoreTimeAttackX {
  score02_id: string;
  player_id: string;          // FK - Player
  score02_verdict: string;    // 'WIN' | 'LOSE'
  score02_time_duration: number; // seconds survived
  score02_created_date: number;  // epoch ms
}

// Computer AI player ID (Firestore ID)
export const AI_PLAYER_ID = 'ai_computer';

// =============================================================================
// Player Functions
// =============================================================================

export async function createOrGetPlayer(name: string, docId?: string): Promise<Player> {
  // If we have a specific docId (Auth UID), usage it.
  // Otherwise, fallback to a name-based ID for guests (not ideal but keeps strict users collection)
  // or a fixed guest ID.
  const userId = docId || `guest_${name.replace(/\s+/g, '_').toLowerCase()}`;

  // Check if profile exists
  let profile = await getFirestorePlayerById(userId);

  if (!profile) {
    // Create it
    await createInitialProfile(userId, name);
    // Fetch again to be sure or just construct it
    profile = {
      uid: userId,
      displayName: name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      count_win: 0
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
      count_lose: 0
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
        count_lose: 0
      };
    }
  } catch { }
  return null;
}

export async function getAllPlayers(): Promise<Player[]> {
  return []; // Not implemented/needed for current UI
}

// =============================================================================
// Score_FirstToX Functions
// =============================================================================

export interface SaveFirstToXInput {
  playerId: number | string;       // Player 1
  opponentId: number | string;     // Player 2 (AI = 1)
  playerScore: number;
  opponentScore: number;
  winnerId: number | string;
  timeElapsed: number;    // seconds
  isOnline?: boolean;
}

export async function saveFirstToXScore(input: SaveFirstToXInput): Promise<void> {
  await firebaseSaveFirstToXScore({
    player_id: String(input.playerId),
    player_id1: String(input.opponentId),
    score01_player: input.playerScore,
    score01_player1: input.opponentScore,
    score01_winner: String(input.winnerId),
    score01_time_elapse: input.timeElapsed,
    score01_created_date: Date.now(),
    is_online: input.isOnline || false,
  });
}

export async function getFirstToXScores(playerId?: number | string, limit = 50): Promise<ScoreFirstToX[]> {
  const pid = playerId ? String(playerId) : undefined;
  // Pass pid to firebase API for server-side filtering
  const scores = await firebaseGetFirstToXScores(limit, pid);
  return scores.map(s => ({ ...s, score01_id: s.score01_id || '' }));
}

// =============================================================================
// Score_TimeAttackX Functions
// =============================================================================

export interface SaveTimeAttackInput {
  playerId: number | string;
  verdict: 'WIN' | 'LOSE';
  timeDuration: number; // seconds survived
  isOnline?: boolean;
}

export async function saveTimeAttackScore(input: SaveTimeAttackInput): Promise<void> {
  await firebaseSaveTimeAttackScore({
    player_id: String(input.playerId),
    score02_verdict: input.verdict,
    score02_time_duration: input.timeDuration,
    score02_created_date: Date.now(),
    is_online: input.isOnline || false,
  });
}

export async function getTimeAttackScores(playerId?: number | string, limit = 50): Promise<ScoreTimeAttackX[]> {
  const pid = playerId ? String(playerId) : undefined;
  const scores = await firebaseGetTimeAttackScores(limit, pid);
  return scores.map(s => ({ ...s, score02_id: s.score02_id || '' }));
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

export async function saveScoreEntry(input: Omit<ScoreEntry, 'createdAt'> & { userId?: string, isOnline?: boolean }): Promise<void> {
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
        name: winner?.player_name ?? (winnerId === AI_PLAYER_ID ? 'COMPUTER' : 'Unknown'),
        mode: 'TIME_ATTACK',
        playerScore: s.score02_time_duration,
        aiScore: s.score02_verdict === 'WIN' ? 0 : 1,
        timeSpent: s.score02_time_duration,
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
    } else if (userId && s.player_id !== userId && s.player_id1 !== userId) {
      // Edge case: I am neither? (Shouldn't happen with filtered query)
      // But if it does, keep as is.
    }

    entries.push({
      id: s.score01_id,
      name: winner?.player_name ?? (winnerId === AI_PLAYER_ID ? 'COMPUTER' : 'Unknown'),
      mode: 'FIRST_TO_X',
      playerScore: myScore,
      aiScore: oppScore,
      createdAt: s.score01_created_date,
    });
  }
  return entries;
}

export async function getTopScores(limit = 50): Promise<ScoreEntry[]> {
  const firstToX = await getScoresByMode('FIRST_TO_X', limit);
  //const timeAttack = await getScoresByMode('TIME_ATTACK', limit);
  // For simplicity and speed in Firestore mode, maybe just return firstToX or combine carefully
  // Fetching both might be slow, but okay for now.
  const timeAttack = await getScoresByMode('TIME_ATTACK', limit);

  return [...firstToX, ...timeAttack]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}
