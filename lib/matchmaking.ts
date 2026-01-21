/**
 * Online Matchmaking System using Firebase REST API
 */

import { getUserId } from './auth';

const FIREBASE_PROJECT_ID = 'water-pong';
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// =============================================================================
// Types
// =============================================================================

export type RoomStatus = 'waiting' | 'countdown' | 'playing' | 'finished';

export interface OnlineRoom {
    room_id: string;
    status: RoomStatus;
    target: number;
    player1_id: string;
    player1_name: string;
    player1_score: number;
    player2_id: string | null;
    player2_name: string | null;
    player2_score: number;
    winner_id: string | null;
    created_at: number;
    countdown_start: number | null;
    // Game settings (synced for both players)
    game_settings: {
        ballSpeed: number;
        paddleWidth: number;
        aiDifficulty: string; // 'insane' for online
    };
}

const ROOMS_COLLECTION = 'online_rooms';

// Target options for random selection
const TARGET_OPTIONS = [3, 5, 7, 10];

// Fixed game settings for online mode
const ONLINE_GAME_SETTINGS = {
    ballSpeed: 8,
    paddleWidth: 100,
    aiDifficulty: 'insane', // AI catches all balls
};

// =============================================================================
// Firestore Helpers
// =============================================================================

function toFirestoreValue(value: any): any {
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number') {
        if (Number.isInteger(value)) return { integerValue: String(value) };
        return { doubleValue: value };
    }
    if (typeof value === 'boolean') return { booleanValue: value };
    if (value === null) return { nullValue: null };
    if (Array.isArray(value)) {
        return { arrayValue: { values: value.map(toFirestoreValue) } };
    }
    if (typeof value === 'object') {
        const fields: any = {};
        for (const key of Object.keys(value)) {
            fields[key] = toFirestoreValue(value[key]);
        }
        return { mapValue: { fields } };
    }
    return { stringValue: String(value) };
}

function fromFirestoreValue(value: any): any {
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.integerValue !== undefined) return parseInt(value.integerValue);
    if (value.doubleValue !== undefined) return value.doubleValue;
    if (value.booleanValue !== undefined) return value.booleanValue;
    if (value.nullValue !== undefined) return null;
    if (value.arrayValue) {
        return (value.arrayValue.values || []).map(fromFirestoreValue);
    }
    if (value.mapValue) {
        const result: any = {};
        for (const key of Object.keys(value.mapValue.fields || {})) {
            result[key] = fromFirestoreValue(value.mapValue.fields[key]);
        }
        return result;
    }
    return null;
}

function toFirestoreDocument(data: Record<string, any>): { fields: Record<string, any> } {
    const fields: Record<string, any> = {};
    for (const key of Object.keys(data)) {
        fields[key] = toFirestoreValue(data[key]);
    }
    return { fields };
}

function fromFirestoreDocument(doc: any): Record<string, any> {
    const result: Record<string, any> = {};
    if (doc.fields) {
        for (const key of Object.keys(doc.fields)) {
            result[key] = fromFirestoreValue(doc.fields[key]);
        }
    }
    if (doc.name) {
        const parts = doc.name.split('/');
        result._id = parts[parts.length - 1];
    }
    return result;
}

// =============================================================================
// Room Functions
// =============================================================================

export async function createRoom(playerName: string): Promise<OnlineRoom | null> {
    const userId = getUserId();
    if (!userId) return null;

    const roomData = {
        status: 'waiting',
        target: TARGET_OPTIONS[Math.floor(Math.random() * TARGET_OPTIONS.length)],
        player1_id: userId,
        player1_name: playerName,
        player1_score: 0,
        player2_id: null,
        player2_name: null,
        player2_score: 0,
        winner_id: null,
        created_at: Date.now(),
        countdown_start: null,
        game_settings: ONLINE_GAME_SETTINGS,
    };

    try {
        const res = await fetch(`${FIRESTORE_BASE_URL}/${ROOMS_COLLECTION}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toFirestoreDocument(roomData)),
        });

        if (res.ok) {
            const created = await res.json();
            const data = fromFirestoreDocument(created);
            return { room_id: data._id, ...roomData } as OnlineRoom;
        }
        return null;
    } catch (error) {
        console.warn('Failed to create room:', error);
        return null;
    }
}

export async function findAvailableRoom(): Promise<OnlineRoom | null> {
    const userId = getUserId();
    if (!userId) {
        console.log('findAvailableRoom: No userId');
        return null;
    }

    try {
        // Simple query without orderBy to avoid index requirement
        const queryUrl = `${FIRESTORE_BASE_URL}:runQuery`;
        const queryBody = {
            structuredQuery: {
                from: [{ collectionId: ROOMS_COLLECTION }],
                where: {
                    fieldFilter: {
                        field: { fieldPath: 'status' },
                        op: 'EQUAL',
                        value: { stringValue: 'waiting' },
                    },
                },
                limit: 20,
            },
        };

        console.log('findAvailableRoom: Searching for rooms...');

        const res = await fetch(queryUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(queryBody),
        });

        if (res.ok) {
            const results = await res.json();
            console.log('findAvailableRoom: Found', results.length, 'results');

            // Sort by created_at in client
            const rooms = results
                .filter((r: any) => r.document)
                .map((r: any) => fromFirestoreDocument(r.document))
                .sort((a: any, b: any) => (a.created_at || 0) - (b.created_at || 0));

            for (const data of rooms) {
                console.log('findAvailableRoom: Checking room', data._id, 'player1:', data.player1_id, 'current:', userId);
                // Don't join own room
                if (data.player1_id !== userId) {
                    console.log('findAvailableRoom: Found available room:', data._id);
                    return {
                        room_id: data._id,
                        status: data.status,
                        target: data.target,
                        player1_id: data.player1_id,
                        player1_name: data.player1_name,
                        player1_score: data.player1_score || 0,
                        player2_id: data.player2_id,
                        player2_name: data.player2_name,
                        player2_score: data.player2_score || 0,
                        winner_id: data.winner_id,
                        created_at: data.created_at,
                        countdown_start: data.countdown_start,
                        game_settings: data.game_settings || ONLINE_GAME_SETTINGS,
                    };
                }
            }
            console.log('findAvailableRoom: No available room (all owned by current user)');
        } else {
            const errorText = await res.text();
            console.warn('findAvailableRoom: Query failed:', res.status, errorText);
        }
        return null;
    } catch (error) {
        console.warn('Failed to find room:', error);
        return null;
    }
}

export async function joinRoom(roomId: string, playerName: string): Promise<boolean> {
    const userId = getUserId();
    if (!userId) return false;

    try {
        // Update room with player2 info and start countdown
        const updateUrl = `${FIRESTORE_BASE_URL}/${ROOMS_COLLECTION}/${roomId}?updateMask.fieldPaths=player2_id&updateMask.fieldPaths=player2_name&updateMask.fieldPaths=status&updateMask.fieldPaths=countdown_start`;

        const updateData = {
            player2_id: userId,
            player2_name: playerName,
            status: 'countdown',
            countdown_start: Date.now(),
        };

        const res = await fetch(updateUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toFirestoreDocument(updateData)),
        });

        return res.ok;
    } catch (error) {
        console.warn('Failed to join room:', error);
        return false;
    }
}

export async function getRoom(roomId: string): Promise<OnlineRoom | null> {
    try {
        const res = await fetch(`${FIRESTORE_BASE_URL}/${ROOMS_COLLECTION}/${roomId}`);

        if (res.ok) {
            const doc = await res.json();
            const data = fromFirestoreDocument(doc);
            return {
                room_id: data._id,
                status: data.status,
                target: data.target,
                player1_id: data.player1_id,
                player1_name: data.player1_name,
                player1_score: data.player1_score || 0,
                player2_id: data.player2_id,
                player2_name: data.player2_name,
                player2_score: data.player2_score || 0,
                winner_id: data.winner_id,
                created_at: data.created_at,
                countdown_start: data.countdown_start,
                game_settings: data.game_settings || ONLINE_GAME_SETTINGS,
            };
        }
        return null;
    } catch (error) {
        console.warn('Failed to get room:', error);
        return null;
    }
}

export async function updateRoomStatus(roomId: string, status: RoomStatus): Promise<boolean> {
    try {
        const updateUrl = `${FIRESTORE_BASE_URL}/${ROOMS_COLLECTION}/${roomId}?updateMask.fieldPaths=status`;

        const res = await fetch(updateUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toFirestoreDocument({ status })),
        });

        return res.ok;
    } catch (error) {
        console.warn('Failed to update room status:', error);
        return false;
    }
}

export async function updatePlayerScore(roomId: string, isPlayer1: boolean, score: number): Promise<boolean> {
    try {
        const field = isPlayer1 ? 'player1_score' : 'player2_score';
        const updateUrl = `${FIRESTORE_BASE_URL}/${ROOMS_COLLECTION}/${roomId}?updateMask.fieldPaths=${field}`;

        const res = await fetch(updateUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toFirestoreDocument({ [field]: score })),
        });

        return res.ok;
    } catch (error) {
        console.warn('Failed to update score:', error);
        return false;
    }
}

export async function declareWinner(roomId: string, winnerId: string): Promise<boolean> {
    try {
        const updateUrl = `${FIRESTORE_BASE_URL}/${ROOMS_COLLECTION}/${roomId}?updateMask.fieldPaths=winner_id&updateMask.fieldPaths=status`;

        const res = await fetch(updateUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toFirestoreDocument({ winner_id: winnerId, status: 'finished' })),
        });

        return res.ok;
    } catch (error) {
        console.warn('Failed to declare winner:', error);
        return false;
    }
}

export async function deleteRoom(roomId: string): Promise<boolean> {
    try {
        const res = await fetch(`${FIRESTORE_BASE_URL}/${ROOMS_COLLECTION}/${roomId}`, {
            method: 'DELETE',
        });
        return res.ok;
    } catch (error) {
        console.warn('Failed to delete room:', error);
        return false;
    }
}

// =============================================================================
// Polling helper (since REST API doesn't support realtime)
// =============================================================================

export function pollRoom(
    roomId: string,
    callback: (room: OnlineRoom | null) => void,
    intervalMs = 1000
): () => void {
    let active = true;

    const poll = async () => {
        if (!active) return;
        const room = await getRoom(roomId);
        callback(room);
        if (active) {
            setTimeout(poll, intervalMs);
        }
    };

    poll();

    return () => {
        active = false;
    };
}
