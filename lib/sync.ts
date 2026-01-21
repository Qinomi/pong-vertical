import {
    AI_PLAYER_ID,
    createOrGetPlayer // Import this
    ,




    SaveFirstToXInput,
    SaveTimeAttackInput,
    updatePlayerStats
} from './db';
import {
    FIREBASE_AI_PLAYER_ID,
    firebaseSaveFirstToXScore, // Removed player creation fn
    firebaseSaveTimeAttackScore,
    isFirebaseAvailable,
} from './firebase';
import { checkNetworkStatus } from './network';

// =============================================================================
// Types for pending sync
// =============================================================================

interface PendingScore {
    id: string;
    type: 'first_to_x' | 'time_attack';
    data: any;
    playerName: string;
    createdAt: number;
}

// In-memory queue for pending syncs
let pendingQueue: PendingScore[] = [];

// Player ID mapping: local ID -> Firebase ID
const playerIdMap = new Map<number | string, string>();

// =============================================================================
// Sync Functions
// =============================================================================

async function getFirebasePlayerId(localPlayerId: number | string, playerName: string): Promise<string> {
    if (localPlayerId === AI_PLAYER_ID) {
        return FIREBASE_AI_PLAYER_ID;
    }

    if (playerIdMap.has(localPlayerId)) {
        return playerIdMap.get(localPlayerId)!;
    }

    // If it's already a string, assume it's a valid ID (Auth UID)
    if (typeof localPlayerId === 'string') {
        return localPlayerId;
    }

    // Legacy numeric ID fallback: try to find/create by name using unified logic
    const player = await createOrGetPlayer(playerName);
    if (player) {
        // player_id is now string from createOrGetPlayer
        const pid = String(player.player_id);
        playerIdMap.set(localPlayerId, pid);
        return pid;
    }

    return playerName; // Fallback to name if all fails
}

async function syncPendingScores(): Promise<void> {
    if (pendingQueue.length === 0) return;

    const isOnline = await checkNetworkStatus();
    if (!isOnline) return;

    const firebaseOk = await isFirebaseAvailable();
    if (!firebaseOk) return;

    const toSync = [...pendingQueue];
    pendingQueue = [];

    for (const item of toSync) {
        try {
            if (item.type === 'first_to_x') {
                const result = await firebaseSaveFirstToXScore(item.data);
                if (!result) throw new Error('Save failed');
            } else {
                const result = await firebaseSaveTimeAttackScore(item.data);
                if (!result) throw new Error('Save failed');
            }
            console.log(`Synced pending ${item.type} score to Firebase`);
        } catch (error) {
            pendingQueue.push(item);
        }
    }
}

// Subscribe to network changes
// =============================================================================
// Public API
// =============================================================================

export interface SaveScoreOptions {
    playerName: string;
    isOnlineMode: boolean;
}

// =============================================================================
// Public API
// =============================================================================

export interface SaveScoreOptions {
    playerName: string;
    isOnlineMode: boolean;
    dedupId?: string; // Optional deduplication ID (e.g. roomId)
}

export async function saveFirstToXWithSync(
    input: SaveFirstToXInput,
    options: SaveScoreOptions
): Promise<void> {
    // 1. Update stats (Win/Loss counts on User Profile)
    const isWin = input.winnerId === input.playerId;
    await updatePlayerStats(input.playerId, isWin);
    if (input.opponentId !== AI_PLAYER_ID) {
        await updatePlayerStats(input.opponentId, !isWin);
    }

    // 2. Prepare Match Data
    const firebasePlayerId = await getFirebasePlayerId(input.playerId, options.playerName);
    const firebaseOpponentId = input.opponentId === AI_PLAYER_ID
        ? FIREBASE_AI_PLAYER_ID
        : String(input.opponentId);

    const firebaseData = {
        player_id: firebasePlayerId,
        player_id1: firebaseOpponentId,
        score01_player: input.playerScore,
        score01_player1: input.opponentScore,
        score01_winner: isWin ? firebasePlayerId : firebaseOpponentId,
        score01_time_elapse: input.timeElapsed,
        score01_created_date: Date.now(),
        is_online: options.isOnlineMode,
    };

    // 3. Try to save to Firebase
    const isOnline = await checkNetworkStatus();
    const firebaseOk = isOnline && await isFirebaseAvailable();

    if (firebaseOk) {
        try {
            // Pass dedupId if available
            const result = await firebaseSaveFirstToXScore(firebaseData, options.dedupId);
            if (result) {
                console.log('Saved First to X score to Firebase:', result);
            } else {
                throw new Error('Save failed');
            }
        } catch {
            queuePendingFirstToX(firebaseData, options.playerName);
        }
    } else {
        queuePendingFirstToX(firebaseData, options.playerName);
        console.log('Offline: queued First to X score for later sync');
    }
}

function queuePendingFirstToX(data: any, playerName: string) {
    pendingQueue.push({
        id: `ftx_${Date.now()}`,
        type: 'first_to_x',
        data,
        playerName,
        createdAt: Date.now(),
    });
}

export async function saveTimeAttackWithSync(
    input: SaveTimeAttackInput,
    options: SaveScoreOptions
): Promise<void> {
    // 1. Update stats
    const isWin = input.verdict === 'WIN';
    await updatePlayerStats(input.playerId, isWin);

    // 2. Prepare Match Data
    const firebasePlayerId = await getFirebasePlayerId(input.playerId, options.playerName);

    const firebaseData = {
        player_id: firebasePlayerId,
        score02_verdict: input.verdict,
        score02_time_duration: input.timeDuration,
        score02_created_date: Date.now(),
        is_online: options.isOnlineMode,
    };

    // 3. Try to save to Firebase
    const isOnline = await checkNetworkStatus();
    const firebaseOk = isOnline && await isFirebaseAvailable();

    if (firebaseOk) {
        try {
            const result = await firebaseSaveTimeAttackScore(firebaseData);
            if (result) {
                console.log('Saved Time Attack score to Firebase:', result);
            } else {
                throw new Error('Save failed');
            }
        } catch {
            queuePendingTimeAttack(firebaseData, options.playerName);
        }
    } else {
        queuePendingTimeAttack(firebaseData, options.playerName);
        console.log('Offline: queued Time Attack score for later sync');
    }
}

function queuePendingTimeAttack(data: any, playerName: string) {
    pendingQueue.push({
        id: `ta_${Date.now()}`,
        type: 'time_attack',
        data,
        playerName,
        createdAt: Date.now(),
    });
}

// Replaced in previous edit
// Keeping this block clean or empty if handled by previous large chunk replacement.
// Wait, previous replacement handled `saveTimeAttackWithSync` too?
// Yes, I included it in the ReplacementContent of Step 1401 logic.
// But technically Step 1401 `TargetContent` might not have covered `saveTimeAttackWithSync` fully if it cut off?
// Let's check 1378 content.
// The `TargetContent` in 1401 covered `saveFirstToXWithSync` down to its closing brace?
// The previous tool call output will fail if TargetContent wasn't precise.
// But assuming 1401 succeeded (it will execute now), I don't need this call.
// BUT I am in parallel with 1401? No, sequential.
// I will cancel this generic thought and assume 1401 covers it if I structured it right.
// Checking 1401 ReplacementContent: It contains BOTH `saveFirstToXWithSync` AND `saveTimeAttackWithSync`.
// Checking 1401 TargetContent: It starts at `export async function saveFirstToXWithSync` and ends at `}` of that function.
// So `saveTimeAttackWithSync` IS NOT in target content of 1401. 
// So 1401 will simply replace `saveFirstToXWithSync` WITH both functions.
// This will result in duplicate `saveTimeAttackWithSync` (the old one below).
// I must delete the OLD `saveTimeAttackWithSync` in this separate call.

export function getPendingCount(): number {
    return pendingQueue.length;
}

export async function forceSyncNow(): Promise<void> {
    await syncPendingScores();
}
