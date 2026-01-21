/**
 * Firebase Realtime Database for real-time score sync
 * Uses EventSource (Server-Sent Events) for real-time updates
 */

const FIREBASE_DATABASE_URL = 'https://water-pong-default-rtdb.firebaseio.com';

// =============================================================================
// Types
// =============================================================================

export interface RealtimeRoom {
    room_id: string;
    status: 'waiting' | 'countdown' | 'playing' | 'finished';
    target: number;
    player1_id: string;
    player1_name: string;
    player1_score: number;
    player2_id: string | null;
    player2_name: string | null;
    player2_score: number;
    winner_id: string | null;
    created_at: number;
}

// =============================================================================
// Room CRUD Operations
// =============================================================================

export async function rtCreateRoom(roomData: Omit<RealtimeRoom, 'room_id'>): Promise<string | null> {
    try {
        const res = await fetch(`${FIREBASE_DATABASE_URL}/rooms.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(roomData),
        });

        if (res.ok) {
            const data = await res.json();
            return data.name; // Firebase returns { name: "generated-key" }
        }
        return null;
    } catch (error) {
        console.warn('rtCreateRoom failed:', error);
        return null;
    }
}

export async function rtGetRoom(roomId: string): Promise<RealtimeRoom | null> {
    try {
        const res = await fetch(`${FIREBASE_DATABASE_URL}/rooms/${roomId}.json`);
        if (res.ok) {
            const data = await res.json();
            if (data) {
                return { room_id: roomId, ...data };
            }
        }
        return null;
    } catch (error) {
        console.warn('rtGetRoom failed:', error);
        return null;
    }
}

export async function rtUpdateRoom(roomId: string, updates: Partial<RealtimeRoom>): Promise<boolean> {
    try {
        const res = await fetch(`${FIREBASE_DATABASE_URL}/rooms/${roomId}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });
        return res.ok;
    } catch (error) {
        console.warn('rtUpdateRoom failed:', error);
        return false;
    }
}

export async function rtUpdateScore(roomId: string, isPlayer1: boolean, score: number): Promise<boolean> {
    const field = isPlayer1 ? 'player1_score' : 'player2_score';
    return rtUpdateRoom(roomId, { [field]: score });
}

export async function rtDeleteRoom(roomId: string): Promise<boolean> {
    try {
        const res = await fetch(`${FIREBASE_DATABASE_URL}/rooms/${roomId}.json`, {
            method: 'DELETE',
        });
        return res.ok;
    } catch (error) {
        console.warn('rtDeleteRoom failed:', error);
        return false;
    }
}

export async function rtFindWaitingRoom(excludePlayerId: string): Promise<RealtimeRoom | null> {
    try {
        // Fetch all rooms and filter in client (no index required)
        const res = await fetch(`${FIREBASE_DATABASE_URL}/rooms.json`);

        if (res.ok) {
            const data = await res.json();
            console.log('rtFindWaitingRoom: fetched rooms:', data ? Object.keys(data).length : 0);

            if (data) {
                for (const [roomId, roomData] of Object.entries(data)) {
                    const room = roomData as any;
                    console.log('Checking room:', roomId, 'status:', room.status, 'player1:', room.player1_id);

                    // Find rooms with status "waiting" that belong to other players
                    if (room.status === 'waiting' && room.player1_id !== excludePlayerId) {
                        console.log('Found waiting room!', roomId);
                        return { room_id: roomId, ...room };
                    }
                }
            }
        } else {
            console.warn('rtFindWaitingRoom: fetch failed', res.status);
        }
        return null;
    } catch (error) {
        console.warn('rtFindWaitingRoom failed:', error);
        return null;
    }
}

// =============================================================================
// Real-time Subscription using polling (SSE not supported in RN)
// Uses faster polling interval for near-realtime updates
// =============================================================================

export function rtSubscribeToRoom(
    roomId: string,
    onUpdate: (room: RealtimeRoom | null) => void,
    intervalMs = 200 // Much faster polling - 200ms = 5 updates/second
): () => void {
    let active = true;
    let lastData: string | null = null;

    const poll = async () => {
        if (!active) return;

        try {
            const room = await rtGetRoom(roomId);
            const currentData = JSON.stringify(room);

            // Only trigger callback if data changed
            if (currentData !== lastData) {
                lastData = currentData;
                onUpdate(room);
            }
        } catch (error) {
            console.warn('rtSubscribeToRoom poll error:', error);
        }

        if (active) {
            setTimeout(poll, intervalMs);
        }
    };

    poll();

    return () => {
        active = false;
    };
}
