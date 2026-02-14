/**
 * Firestore User Profile Management
 * Handles creating and updating user profiles (ID, Name) in Firestore
 */

import { checkNetworkStatus } from './network';
import {
    SQLitePlayer,
    sqliteGetAllPlayers,
    sqliteGetPlayer,
    sqliteIncrementWin,
    sqliteUpsertPlayer,
} from './sqlite';

const FIREBASE_PROJECT_ID = 'water-pong';
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const USERS_COLLECTION = 'users';

export interface UserProfile {
    uid: string;
    displayName: string;
    createdAt: number;
    updatedAt: number;
    count_win?: number;
}

// Helper to convert to Firestore format
function toFirestoreValue(value: any): any {
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number') {
        if (Number.isInteger(value)) return { integerValue: String(value) };
        return { doubleValue: value };
    }
    return { stringValue: String(value) };
}

function toFirestoreDocument(data: Record<string, any>): { fields: Record<string, any> } {
    const fields: Record<string, any> = {};
    for (const key of Object.keys(data)) {
        fields[key] = toFirestoreValue(data[key]);
    }
    return { fields };
}

// Helper to convert from Firestore format
function fromFirestoreValue(value: any): any {
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.integerValue !== undefined) return parseInt(value.integerValue);
    if (value.doubleValue !== undefined) return value.doubleValue;
    return null;
}

function fromFirestoreDocument(doc: any): Record<string, any> {
    const result: Record<string, any> = {};
    if (doc.fields) {
        for (const key of Object.keys(doc.fields)) {
            result[key] = fromFirestoreValue(doc.fields[key]);
        }
    }
    return result;
}

function fromSQLitePlayer(player: SQLitePlayer): UserProfile {
    return {
        uid: player.player_id,
        displayName: player.player_name || 'Guest',
        createdAt: player.player_created_date || 0,
        updatedAt: player.player_updated_date ?? player.player_created_date ?? 0,
        count_win: player.count_win || 0,
    };
}

async function cacheUserProfile(profile: UserProfile): Promise<void> {
    await sqliteUpsertPlayer({
        player_id: profile.uid,
        player_name: profile.displayName || 'Guest',
        player_created_date: profile.createdAt || Date.now(),
        player_updated_date: profile.updatedAt || profile.createdAt || Date.now(),
        count_win: profile.count_win || 0,
        count_lose: 0,
    });
}

function mergeProfiles(localList: UserProfile[], remoteList: UserProfile[], limit: number): UserProfile[] {
    const map = new Map<string, UserProfile>();

    for (const user of localList) {
        map.set(user.uid, user);
    }
    for (const user of remoteList) {
        map.set(user.uid, user);
    }

    const merged = [...map.values()].sort((a, b) => {
        const winDiff = (b.count_win || 0) - (a.count_win || 0);
        if (winDiff !== 0) return winDiff;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    return limit > 0 ? merged.slice(0, limit) : merged;
}

/**
 * Get user profile from Firestore (fallback to SQLite when offline)
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
    const localProfile = await sqliteGetPlayer(userId);
    const online = await checkNetworkStatus();

    if (!online) {
        return localProfile ? fromSQLitePlayer(localProfile) : null;
    }

    try {
        const url = `${FIRESTORE_BASE_URL}/${USERS_COLLECTION}/${userId}`;
        const res = await fetch(url);

        if (res.ok) {
            const doc = await res.json();
            const data = fromFirestoreDocument(doc);
            const profile: UserProfile = {
                uid: userId,
                displayName: data.displayName || 'Guest',
                createdAt: data.createdAt || Date.now(),
                updatedAt: data.updatedAt || Date.now(),
                count_win: data.count_win || 0,
            };

            await cacheUserProfile(profile);
            return profile;
        }

        return localProfile ? fromSQLitePlayer(localProfile) : null;
    } catch (error) {
        console.warn('getUserProfile error:', error);
        return localProfile ? fromSQLitePlayer(localProfile) : null;
    }
}

/**
 * Create or Update user profile
 */
export async function updateUserProfile(userId: string, displayName: string): Promise<boolean> {
    const now = Date.now();
    let remoteOk = false;

    try {
        const url = `${FIRESTORE_BASE_URL}/${USERS_COLLECTION}/${userId}`;
        const data = {
            displayName,
            updatedAt: now,
        };

        const res = await fetch(`${url}?updateMask.fieldPaths=displayName&updateMask.fieldPaths=updatedAt`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toFirestoreDocument(data)),
        });

        remoteOk = res.ok;
    } catch (error) {
        console.warn('updateUserProfile error:', error);
    }

    const existing = await sqliteGetPlayer(userId);
    await sqliteUpsertPlayer({
        player_id: userId,
        player_name: displayName,
        player_created_date: existing?.player_created_date ?? now,
        player_updated_date: now,
        count_win: existing?.count_win ?? 0,
        count_lose: existing?.count_lose ?? 0,
    });

    return remoteOk;
}

/**
 * Increment user win count
 */
export async function incrementUserWin(userId: string): Promise<void> {
    try {
        await sqliteIncrementWin(userId);
    } catch {
        // Ignore local cache update errors
    }

    try {
        const url = `${FIRESTORE_BASE_URL}:commit`;
        const fullPath = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${USERS_COLLECTION}/${userId}`;

        const commitBody = {
            writes: [
                {
                    transform: {
                        document: fullPath,
                        fieldTransforms: [
                            {
                                fieldPath: 'count_win',
                                increment: { integerValue: '1' }
                            }
                        ]
                    }
                }
            ]
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(commitBody),
        });

        if (!res.ok) {
            console.warn('incrementUserWin failed:', await res.text());
        }
    } catch (error) {
        console.warn('incrementUserWin error:', error);
    }
}

/**
 * Get Leaderboard (fallback to SQLite when offline)
 */
export async function getLeaderboard(limit: number = 50): Promise<UserProfile[]> {
    const localPlayers = await sqliteGetAllPlayers();
    const localProfiles = localPlayers.map(fromSQLitePlayer);

    const online = await checkNetworkStatus();
    if (!online) {
        return limit > 0 ? localProfiles.slice(0, limit) : localProfiles;
    }

    try {
        const url = `${FIRESTORE_BASE_URL}:runQuery`;

        // Fetch all users for cache, then apply UI limit after merge.
        const query = {
            structuredQuery: {
                from: [{ collectionId: USERS_COLLECTION }],
                orderBy: [
                    { field: { fieldPath: 'count_win' }, direction: 'DESCENDING' }
                ],
            }
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(query),
        });

        if (!res.ok) {
            return limit > 0 ? localProfiles.slice(0, limit) : localProfiles;
        }

        const list = await res.json();
        const remoteProfiles: UserProfile[] = list
            .map((item: any) => {
                if (!item.document) return null;
                const data = fromFirestoreDocument(item.document);
                const nameParts = item.document.name.split('/');
                const id = nameParts[nameParts.length - 1];

                return {
                    uid: id,
                    displayName: data.displayName || 'Guest',
                    createdAt: data.createdAt || 0,
                    updatedAt: data.updatedAt || 0,
                    count_win: data.count_win || 0,
                } as UserProfile;
            })
            .filter(Boolean);

        await Promise.all(remoteProfiles.map((profile) => cacheUserProfile(profile)));

        return mergeProfiles(localProfiles, remoteProfiles, limit);
    } catch (error) {
        console.warn('getLeaderboard error:', error);
        return limit > 0 ? localProfiles.slice(0, limit) : localProfiles;
    }
}

/**
 * Create initial profile if it doesn't exist
 */
export async function createInitialProfile(userId: string, defaultName: string = 'Guest'): Promise<void> {
    const now = Date.now();
    const createUrl = `${FIRESTORE_BASE_URL}/${USERS_COLLECTION}/${userId}`;
    const data = {
        displayName: defaultName,
        createdAt: now,
        updatedAt: now,
        count_win: 0,
    };

    try {
        await fetch(createUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toFirestoreDocument(data)),
        });
    } catch (error) {
        console.warn('createInitialProfile error:', error);
    }

    const existing = await sqliteGetPlayer(userId);
    await sqliteUpsertPlayer({
        player_id: userId,
        player_name: defaultName,
        player_created_date: existing?.player_created_date ?? now,
        player_updated_date: now,
        count_win: existing?.count_win ?? 0,
        count_lose: existing?.count_lose ?? 0,
    });
}
