import {
  AI_PLAYER_ID,
  createOrGetPlayer,
  SaveFirstToXInput,
  SaveTimeAttackInput,
  updatePlayerStats,
} from './db';
import {
  FIREBASE_AI_PLAYER_ID,
  firebaseSaveFirstToXScore,
  firebaseSaveTimeAttackScore,
  isFirebaseAvailable,
} from './firebase';
import { checkNetworkStatus, subscribeToNetworkChanges } from './network';
import {
  sqliteGetUnsyncedFirstToXScores,
  sqliteGetUnsyncedTimeAttackScores,
  sqliteMarkFirstToXSynced,
  sqliteMarkTimeAttackSynced,
  sqliteSaveFirstToXScore,
  sqliteSaveTimeAttackScore,
} from './sqlite';

interface PendingScore {
  id: string;
  type: 'first_to_x' | 'time_attack';
  data: any;
}

let pendingQueue: PendingScore[] = [];
const playerIdMap = new Map<number | string, string>();
let syncing = false;

async function getFirebasePlayerId(localPlayerId: number | string, playerName: string): Promise<string> {
  if (localPlayerId === AI_PLAYER_ID) {
    return FIREBASE_AI_PLAYER_ID;
  }

  if (playerIdMap.has(localPlayerId)) {
    return playerIdMap.get(localPlayerId)!;
  }

  if (typeof localPlayerId === 'string') {
    return localPlayerId;
  }

  const player = await createOrGetPlayer(playerName);
  const pid = String(player.player_id);
  playerIdMap.set(localPlayerId, pid);
  return pid;
}

function toFirebasePlayerId(playerId: string): string {
  return playerId === AI_PLAYER_ID ? FIREBASE_AI_PLAYER_ID : playerId;
}

function queuePending(item: PendingScore) {
  pendingQueue.push(item);
}

function createScoreId(prefix: 'ftx' | 'ta', customId?: string): string {
  if (customId) return customId;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

async function syncPendingScores(): Promise<void> {
  if (syncing) return;

  syncing = true;
  try {
    const isOnline = await checkNetworkStatus();
    if (!isOnline) return;

    const firebaseOk = await isFirebaseAvailable();
    if (!firebaseOk) return;

    if (pendingQueue.length > 0) {
      const toSync = [...pendingQueue];
      pendingQueue = [];

      for (const item of toSync) {
        try {
          if (item.type === 'first_to_x') {
            const result = await firebaseSaveFirstToXScore(item.data, item.id);
            if (!result) throw new Error('Save failed');
            await sqliteMarkFirstToXSynced(item.id);
          } else {
            const result = await firebaseSaveTimeAttackScore(item.data, item.id);
            if (!result) throw new Error('Save failed');
            await sqliteMarkTimeAttackSynced(item.id);
          }
        } catch {
          pendingQueue.push(item);
        }
      }
    }

    // Retry all persisted unsynced rows as well (survives app restart)
    const unsyncedFirstToX = await sqliteGetUnsyncedFirstToXScores();
    for (const score of unsyncedFirstToX) {
      const ok = await firebaseSaveFirstToXScore(
        {
          player_id: toFirebasePlayerId(score.player_id),
          player_id1: toFirebasePlayerId(score.player_id1),
          score01_player: score.score01_player,
          score01_player1: score.score01_player1,
          score01_winner: toFirebasePlayerId(score.score01_winner),
          score01_time_elapse: score.score01_time_elapse,
          score01_created_date: score.score01_created_date,
          is_online: false,
        },
        score.score01_id
      );

      if (ok) {
        await sqliteMarkFirstToXSynced(score.score01_id);
      }
    }

    const unsyncedTimeAttack = await sqliteGetUnsyncedTimeAttackScores();
    for (const score of unsyncedTimeAttack) {
      const ok = await firebaseSaveTimeAttackScore(
        {
          player_id: toFirebasePlayerId(score.player_id),
          score02_verdict: score.score02_verdict,
          score02_time_duration: score.score02_time_duration,
          score02_created_date: score.score02_created_date,
          is_online: false,
        },
        score.score02_id
      );

      if (ok) {
        await sqliteMarkTimeAttackSynced(score.score02_id);
      }
    }
  } finally {
    syncing = false;
  }
}

subscribeToNetworkChanges((connected) => {
  if (connected) {
    void syncPendingScores();
  }
});
void syncPendingScores();

export interface SaveScoreOptions {
  playerName: string;
  isOnlineMode: boolean;
  dedupId?: string;
}

export async function saveFirstToXWithSync(input: SaveFirstToXInput, options: SaveScoreOptions): Promise<void> {
  const isWin = input.winnerId === input.playerId;

  await updatePlayerStats(input.playerId, isWin);
  if (input.opponentId !== AI_PLAYER_ID) {
    await updatePlayerStats(input.opponentId, !isWin);
  }

  const createdAt = Date.now();
  const scoreId = createScoreId('ftx', options.dedupId);

  const localPlayerId = String(input.playerId);
  const localOpponentId = input.opponentId === AI_PLAYER_ID ? AI_PLAYER_ID : String(input.opponentId);
  const localWinnerId = isWin ? localPlayerId : localOpponentId;

  await sqliteSaveFirstToXScore({
    score01_id: scoreId,
    player_id: localPlayerId,
    player_id1: localOpponentId,
    score01_player: input.playerScore,
    score01_player1: input.opponentScore,
    score01_winner: localWinnerId,
    score01_time_elapse: input.timeElapsed,
    score01_created_date: createdAt,
  });

  const firebasePlayerId = await getFirebasePlayerId(input.playerId, options.playerName);
  const firebaseOpponentId = input.opponentId === AI_PLAYER_ID ? FIREBASE_AI_PLAYER_ID : String(input.opponentId);

  const firebaseData = {
    player_id: firebasePlayerId,
    player_id1: firebaseOpponentId,
    score01_player: input.playerScore,
    score01_player1: input.opponentScore,
    score01_winner: isWin ? firebasePlayerId : firebaseOpponentId,
    score01_time_elapse: input.timeElapsed,
    score01_created_date: createdAt,
    is_online: options.isOnlineMode,
  };

  const isOnline = await checkNetworkStatus();
  const firebaseOk = isOnline && (await isFirebaseAvailable());

  if (firebaseOk) {
    const result = await firebaseSaveFirstToXScore(firebaseData, scoreId);
    if (result) {
      await sqliteMarkFirstToXSynced(scoreId);
    } else {
      queuePending({ id: scoreId, type: 'first_to_x', data: firebaseData });
    }
  } else {
    queuePending({ id: scoreId, type: 'first_to_x', data: firebaseData });
  }

  void syncPendingScores();
}

export async function saveTimeAttackWithSync(input: SaveTimeAttackInput, options: SaveScoreOptions): Promise<void> {
  const isWin = input.verdict === 'WIN';
  await updatePlayerStats(input.playerId, isWin);

  const createdAt = Date.now();
  const scoreId = createScoreId('ta', options.dedupId);
  const localPlayerId = String(input.playerId);

  await sqliteSaveTimeAttackScore({
    score02_id: scoreId,
    player_id: localPlayerId,
    score02_verdict: input.verdict,
    score02_time_duration: input.timeDuration,
    score02_created_date: createdAt,
  });

  const firebasePlayerId = await getFirebasePlayerId(input.playerId, options.playerName);
  const firebaseData = {
    player_id: firebasePlayerId,
    score02_verdict: input.verdict,
    score02_time_duration: input.timeDuration,
    score02_created_date: createdAt,
    is_online: options.isOnlineMode,
  };

  const isOnline = await checkNetworkStatus();
  const firebaseOk = isOnline && (await isFirebaseAvailable());

  if (firebaseOk) {
    const result = await firebaseSaveTimeAttackScore(firebaseData, scoreId);
    if (result) {
      await sqliteMarkTimeAttackSynced(scoreId);
    } else {
      queuePending({ id: scoreId, type: 'time_attack', data: firebaseData });
    }
  } else {
    queuePending({ id: scoreId, type: 'time_attack', data: firebaseData });
  }

  void syncPendingScores();
}

export function getPendingCount(): number {
  return pendingQueue.length;
}

export async function forceSyncNow(): Promise<void> {
  await syncPendingScores();
}
