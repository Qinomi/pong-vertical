/**
 * SQLite Database Module
 * Local database for offline storage using expo-sqlite
 */

import * as SQLite from 'expo-sqlite';

// =============================================================================
// Types
// =============================================================================

export interface SQLitePlayer {
    player_id: string;
    player_name: string;
    player_created_date: number;
    player_updated_date?: number;
    count_win: number;
    count_lose: number;
}

export interface SQLiteFirstToXScore {
    score01_id: string;
    player_id: string;
    player_id1: string;
    score01_player: number;
    score01_player1: number;
    score01_winner: string;
    score01_time_elapse: number;
    score01_created_date: number;
    synced: number; // 0 = not synced, 1 = synced
}

export interface SQLiteTimeAttackScore {
    score02_id: string;
    player_id: string;
    score02_verdict: string;
    score02_time_duration: number;
    score02_created_date: number;
    synced: number; // 0 = not synced, 1 = synced
}

export interface SQLiteStorageStats {
    players: number;
    firstToX: number;
    timeAttack: number;
    unsyncedFirstToX: number;
    unsyncedTimeAttack: number;
    pendingDeletedScores: number;
}

export interface SQLitePendingDeletedScore {
    score_id: string;
    score_type: 'first_to_x' | 'time_attack';
    created_date: number;
}

// =============================================================================
// Database Instance
// =============================================================================

const DATABASE_NAME = 'pong_game.db';
let db: SQLite.SQLiteDatabase | null = null;

/**
 * Initialize SQLite database and create tables
 */
export async function initDatabase(): Promise<void> {
    try {
        db = await SQLite.openDatabaseAsync(DATABASE_NAME);

        // Create Players table
        await db.execAsync(`
      CREATE TABLE IF NOT EXISTS players (
        player_id TEXT PRIMARY KEY,
        player_name TEXT NOT NULL,
        player_created_date INTEGER NOT NULL,
        player_updated_date INTEGER,
        count_win INTEGER DEFAULT 0,
        count_lose INTEGER DEFAULT 0
      );
    `);

        // Lightweight migration for older installs: add updated timestamp column if missing.
        try {
            await db.execAsync('ALTER TABLE players ADD COLUMN player_updated_date INTEGER;');
        } catch {
            // Ignore if column already exists
        }
        await db.execAsync(`
      UPDATE players
      SET player_updated_date = COALESCE(player_updated_date, player_created_date)
    `);

        // Create FirstToX Scores table
        await db.execAsync(`
      CREATE TABLE IF NOT EXISTS scores_first_to_x (
        score01_id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        player_id1 TEXT NOT NULL,
        score01_player INTEGER NOT NULL,
        score01_player1 INTEGER NOT NULL,
        score01_winner TEXT NOT NULL,
        score01_time_elapse INTEGER NOT NULL,
        score01_created_date INTEGER NOT NULL,
        synced INTEGER DEFAULT 0
      );
    `);

        // Create TimeAttack Scores table
        await db.execAsync(`
      CREATE TABLE IF NOT EXISTS scores_time_attack (
        score02_id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        score02_verdict TEXT NOT NULL,
        score02_time_duration INTEGER NOT NULL,
        score02_created_date INTEGER NOT NULL,
        synced INTEGER DEFAULT 0
      );
    `);

        // Queue for deletions made while offline (or when delete sync fails)
        await db.execAsync(`
      CREATE TABLE IF NOT EXISTS pending_deleted_scores (
        score_id TEXT NOT NULL,
        score_type TEXT NOT NULL,
        created_date INTEGER NOT NULL,
        PRIMARY KEY (score_id, score_type)
      );
    `);

        console.log('SQLite database initialized successfully');
    } catch (error) {
        console.error('Failed to initialize SQLite database:', error);
        throw error;
    }
}

/**
 * Get database instance (auto-initialize if needed)
 */
async function getDb(): Promise<SQLite.SQLiteDatabase> {
    if (!db) {
        await initDatabase();
    }
    return db!;
}

export async function sqliteGetStorageStats(): Promise<SQLiteStorageStats> {
    const database = await getDb();

    const players = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM players');
    const firstToX = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM scores_first_to_x');
    const timeAttack = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM scores_time_attack');
    const unsyncedFirstToX = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM scores_first_to_x WHERE synced = 0');
    const unsyncedTimeAttack = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM scores_time_attack WHERE synced = 0');
    const pendingDeletedScores = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM pending_deleted_scores');

    return {
        players: players?.count ?? 0,
        firstToX: firstToX?.count ?? 0,
        timeAttack: timeAttack?.count ?? 0,
        unsyncedFirstToX: unsyncedFirstToX?.count ?? 0,
        unsyncedTimeAttack: unsyncedTimeAttack?.count ?? 0,
        pendingDeletedScores: pendingDeletedScores?.count ?? 0,
    };
}

export async function sqliteQueuePendingDeletedScore(
    scoreId: string,
    scoreType: 'first_to_x' | 'time_attack'
): Promise<void> {
    const database = await getDb();
    await database.runAsync(
        `INSERT OR REPLACE INTO pending_deleted_scores (score_id, score_type, created_date)
     VALUES (?, ?, ?)`,
        [scoreId, scoreType, Date.now()]
    );
}

export async function sqliteRemovePendingDeletedScore(
    scoreId: string,
    scoreType: 'first_to_x' | 'time_attack'
): Promise<void> {
    const database = await getDb();
    await database.runAsync(
        'DELETE FROM pending_deleted_scores WHERE score_id = ? AND score_type = ?',
        [scoreId, scoreType]
    );
}

export async function sqliteGetPendingDeletedScoreIds(
    scoreType: 'first_to_x' | 'time_attack'
): Promise<string[]> {
    const database = await getDb();
    const rows = await database.getAllAsync<{ score_id: string }>(
        'SELECT score_id FROM pending_deleted_scores WHERE score_type = ?',
        [scoreType]
    );
    return rows.map((r) => r.score_id);
}

// =============================================================================
// Player CRUD Functions
// =============================================================================

/**
 * Create - Insert a new player
 */
export async function sqliteCreatePlayer(player: Omit<SQLitePlayer, 'count_win' | 'count_lose'>): Promise<void> {
    const database = await getDb();
    const updatedDate = player.player_updated_date ?? player.player_created_date;
    await database.runAsync(
        `INSERT OR REPLACE INTO players (player_id, player_name, player_created_date, player_updated_date, count_win, count_lose)
     VALUES (?, ?, ?, ?, 0, 0)`,
        [player.player_id, player.player_name, player.player_created_date, updatedDate]
    );
}

/**
 * Create/Update - Upsert a player with full stats
 */
export async function sqliteUpsertPlayer(player: SQLitePlayer): Promise<void> {
    const database = await getDb();
    const updatedDate = player.player_updated_date ?? player.player_created_date;
    await database.runAsync(
        `INSERT OR REPLACE INTO players (player_id, player_name, player_created_date, player_updated_date, count_win, count_lose)
     VALUES (?, ?, ?, ?, ?, ?)`,
        [
            player.player_id,
            player.player_name,
            player.player_created_date,
            updatedDate,
            player.count_win,
            player.count_lose
        ]
    );
}

/**
 * Read - Get player by ID
 */
export async function sqliteGetPlayer(playerId: string): Promise<SQLitePlayer | null> {
    const database = await getDb();
    const result = await database.getFirstAsync<SQLitePlayer>(
        'SELECT * FROM players WHERE player_id = ?',
        [playerId]
    );
    return result || null;
}

/**
 * Read - Get all players
 */
export async function sqliteGetAllPlayers(): Promise<SQLitePlayer[]> {
    const database = await getDb();
    return await database.getAllAsync<SQLitePlayer>(
        'SELECT * FROM players ORDER BY count_win DESC, player_updated_date DESC'
    );
}

/**
 * Update - Update player info
 */
export async function sqliteUpdatePlayer(playerId: string, updates: Partial<SQLitePlayer>): Promise<void> {
    const database = await getDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.player_name !== undefined) {
        fields.push('player_name = ?');
        values.push(updates.player_name);
    }
    if (updates.count_win !== undefined) {
        fields.push('count_win = ?');
        values.push(updates.count_win);
    }
    if (updates.count_lose !== undefined) {
        fields.push('count_lose = ?');
        values.push(updates.count_lose);
    }
    if (updates.player_updated_date !== undefined) {
        fields.push('player_updated_date = ?');
        values.push(updates.player_updated_date);
    }

    if (fields.length > 0) {
        values.push(playerId);
        await database.runAsync(
            `UPDATE players SET ${fields.join(', ')} WHERE player_id = ?`,
            values
        );
    }
}

/**
 * Update - Increment win count
 */
export async function sqliteIncrementWin(playerId: string): Promise<void> {
    const database = await getDb();
    await database.runAsync(
        'UPDATE players SET count_win = count_win + 1, player_updated_date = ? WHERE player_id = ?',
        [Date.now(), playerId]
    );
}

/**
 * Delete - Remove a player
 */
export async function sqliteDeletePlayer(playerId: string): Promise<void> {
    const database = await getDb();
    await database.runAsync('DELETE FROM players WHERE player_id = ?', [playerId]);
}

// =============================================================================
// FirstToX Score CRUD Functions
// =============================================================================

/**
 * Create - Save FirstToX score
 */
export async function sqliteSaveFirstToXScore(score: Omit<SQLiteFirstToXScore, 'synced'>): Promise<void> {
    const database = await getDb();
    await database.runAsync(
        `INSERT OR REPLACE INTO scores_first_to_x 
     (score01_id, player_id, player_id1, score01_player, score01_player1, score01_winner, score01_time_elapse, score01_created_date, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
            score.score01_id,
            score.player_id,
            score.player_id1,
            score.score01_player,
            score.score01_player1,
            score.score01_winner,
            score.score01_time_elapse,
            score.score01_created_date
        ]
    );
}

/**
 * Read - Get FirstToX scores
 */
export async function sqliteGetFirstToXScores(playerId?: string, limit: number = 50): Promise<SQLiteFirstToXScore[]> {
    const database = await getDb();

    if (playerId) {
        return await database.getAllAsync<SQLiteFirstToXScore>(
            `SELECT * FROM scores_first_to_x 
       WHERE player_id = ? OR player_id1 = ?
       ORDER BY score01_created_date DESC LIMIT ?`,
            [playerId, playerId, limit]
        );
    }

    return await database.getAllAsync<SQLiteFirstToXScore>(
        'SELECT * FROM scores_first_to_x ORDER BY score01_created_date DESC LIMIT ?',
        [limit]
    );
}

/**
 * Update - Mark score as synced
 */
export async function sqliteMarkFirstToXSynced(scoreId: string): Promise<void> {
    const database = await getDb();
    await database.runAsync(
        'UPDATE scores_first_to_x SET synced = 1 WHERE score01_id = ?',
        [scoreId]
    );
}

/**
 * Read - Get unsynced FirstToX scores
 */
export async function sqliteGetUnsyncedFirstToXScores(): Promise<SQLiteFirstToXScore[]> {
    const database = await getDb();
    return await database.getAllAsync<SQLiteFirstToXScore>(
        'SELECT * FROM scores_first_to_x WHERE synced = 0'
    );
}

/**
 * Delete - Remove FirstToX score
 */
export async function sqliteDeleteFirstToXScore(scoreId: string): Promise<void> {
    const database = await getDb();
    await database.runAsync('DELETE FROM scores_first_to_x WHERE score01_id = ?', [scoreId]);
}

// =============================================================================
// TimeAttack Score CRUD Functions
// =============================================================================

/**
 * Create - Save TimeAttack score
 */
export async function sqliteSaveTimeAttackScore(score: Omit<SQLiteTimeAttackScore, 'synced'>): Promise<void> {
    const database = await getDb();
    await database.runAsync(
        `INSERT OR REPLACE INTO scores_time_attack 
     (score02_id, player_id, score02_verdict, score02_time_duration, score02_created_date, synced)
     VALUES (?, ?, ?, ?, ?, 0)`,
        [
            score.score02_id,
            score.player_id,
            score.score02_verdict,
            score.score02_time_duration,
            score.score02_created_date
        ]
    );
}

/**
 * Read - Get TimeAttack scores
 */
export async function sqliteGetTimeAttackScores(playerId?: string, limit: number = 50): Promise<SQLiteTimeAttackScore[]> {
    const database = await getDb();

    if (playerId) {
        return await database.getAllAsync<SQLiteTimeAttackScore>(
            `SELECT * FROM scores_time_attack 
       WHERE player_id = ?
       ORDER BY score02_created_date DESC LIMIT ?`,
            [playerId, limit]
        );
    }

    return await database.getAllAsync<SQLiteTimeAttackScore>(
        'SELECT * FROM scores_time_attack ORDER BY score02_created_date DESC LIMIT ?',
        [limit]
    );
}

/**
 * Update - Mark score as synced
 */
export async function sqliteMarkTimeAttackSynced(scoreId: string): Promise<void> {
    const database = await getDb();
    await database.runAsync(
        'UPDATE scores_time_attack SET synced = 1 WHERE score02_id = ?',
        [scoreId]
    );
}

/**
 * Read - Get unsynced TimeAttack scores
 */
export async function sqliteGetUnsyncedTimeAttackScores(): Promise<SQLiteTimeAttackScore[]> {
    const database = await getDb();
    return await database.getAllAsync<SQLiteTimeAttackScore>(
        'SELECT * FROM scores_time_attack WHERE synced = 0'
    );
}

/**
 * Delete - Remove TimeAttack score
 */
export async function sqliteDeleteTimeAttackScore(scoreId: string): Promise<void> {
    const database = await getDb();
    await database.runAsync('DELETE FROM scores_time_attack WHERE score02_id = ?', [scoreId]);
}
