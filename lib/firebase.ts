/**
 * Firebase REST API implementation
 * Works on React Native without native dependencies
 */

const FIREBASE_PROJECT_ID = 'water-pong';
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// =============================================================================
// Types
// =============================================================================

export interface FirebasePlayer {
    player_id: string;
    player_name: string;
    player_created_date: number;
    count_win: number;
    count_lose: number;
}

export interface FirebaseFirstToXScore {
    score01_id?: string;
    player_id: string;
    player_id1: string;
    score01_player: number;
    score01_player1: number;
    score01_winner: string;
    score01_time_elapse: number;
    score01_created_date: number;
    is_online?: boolean; // New field
}

export interface FirebaseTimeAttackScore {
    score02_id?: string;
    player_id: string;
    score02_verdict: string;
    score02_time_duration: number;
    score02_created_date: number;
    is_online?: boolean; // New field
}

// Collections
const FIRST_TO_X_COLLECTION = 'scores_first_to_x';
const TIME_ATTACK_COLLECTION = 'scores_time_attack';

export const FIREBASE_AI_PLAYER_ID = 'ai_computer';

// =============================================================================
// Helper functions for Firestore REST API
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
    // Extract document ID from name
    if (doc.name) {
        const parts = doc.name.split('/');
        result._id = parts[parts.length - 1];
    }
    return result;
}

// =============================================================================
// Check if Firebase is available (network check)
// =============================================================================

export async function isFirebaseAvailable(): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        // Check availability via a simple read, e.g. scores collection
        await fetch(`${FIRESTORE_BASE_URL}/${FIRST_TO_X_COLLECTION}?pageSize=1`, {
            signal: controller.signal,
        });

        clearTimeout(timeout);
        return true;
    } catch {
        return false;
    }
}


// =============================================================================
// Score Functions
// =============================================================================

export async function firebaseSaveFirstToXScore(
    score: Omit<FirebaseFirstToXScore, 'score01_id'>,
    customId?: string
): Promise<string | null> {
    try {
        let url = `${FIRESTORE_BASE_URL}/${FIRST_TO_X_COLLECTION}`;
        if (customId) {
            url += `?documentId=${customId}`;
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toFirestoreDocument(score as any)),
        });

        if (res.ok) {
            const created = await res.json();
            const data = fromFirestoreDocument(created);
            return data._id;
        } else if (res.status === 409 && customId) {
            console.log('Document already exists (deduplicated):', customId);
            return customId; // Return ID as success since it's already there
        }
        return null;
    } catch (error) {
        console.warn('Firebase saveFirstToXScore failed:', error);
        return null;
    }
}

export async function firebaseSaveTimeAttackScore(
    score: Omit<FirebaseTimeAttackScore, 'score02_id'>,
    customId?: string
): Promise<string | null> {
    try {
        let url = `${FIRESTORE_BASE_URL}/${TIME_ATTACK_COLLECTION}`;
        if (customId) {
            url += `?documentId=${customId}`;
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toFirestoreDocument(score as any)),
        });

        if (res.ok) {
            const created = await res.json();
            const data = fromFirestoreDocument(created);
            return data._id;
        } else if (res.status === 409 && customId) {
            console.log('Document already exists (deduplicated):', customId);
            return customId;
        }
        return null;
    } catch (error) {
        console.warn('Firebase saveTimeAttackScore failed:', error);
        return null;
    }
}

export async function firebaseGetFirstToXScores(limitCount?: number, playerId?: string): Promise<FirebaseFirstToXScore[]> {
    try {
        const queryUrl = `${FIRESTORE_BASE_URL}:runQuery`;

        let filter: any = undefined;

        if (playerId) {
            // Composite filter for player_id OR player_id1 matches
            filter = {
                compositeFilter: {
                    op: 'OR',
                    filters: [
                        {
                            fieldFilter: {
                                field: { fieldPath: 'player_id' },
                                op: 'EQUAL',
                                value: { stringValue: playerId }
                            }
                        },
                        {
                            fieldFilter: {
                                field: { fieldPath: 'player_id1' },
                                op: 'EQUAL',
                                value: { stringValue: playerId }
                            }
                        }
                    ]
                }
            };
        }

        const structuredQuery: Record<string, any> = {
            from: [{ collectionId: FIRST_TO_X_COLLECTION }],
            where: filter,
            // orderBy removed to avoid needing composite index for OR queries
        };
        if (typeof limitCount === 'number' && limitCount > 0) {
            structuredQuery.limit = limitCount;
        }

        const queryBody = {
            structuredQuery,
        };

        const res = await fetch(queryUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(queryBody),
        });

        if (res.ok) {
            const results = await res.json();
            return results
                .filter((r: any) => r.document)
                .map((r: any) => {
                    const data = fromFirestoreDocument(r.document);
                    return {
                        score01_id: data._id,
                        player_id: data.player_id,
                        player_id1: data.player_id1,
                        score01_player: data.score01_player,
                        score01_player1: data.score01_player1,
                        score01_winner: data.score01_winner,
                        score01_time_elapse: data.score01_time_elapse,
                        score01_created_date: data.score01_created_date,
                        is_online: data.is_online,
                    };
                })
                .sort((a: any, b: any) => b.score01_created_date - a.score01_created_date); // Sort in memory
        }
        return [];
    } catch (error) {
        console.warn('Firebase getFirstToXScores failed:', error);
        return [];
    }
}

export async function firebaseGetTimeAttackScores(limitCount?: number, playerId?: string): Promise<FirebaseTimeAttackScore[]> {
    try {
        const queryUrl = `${FIRESTORE_BASE_URL}:runQuery`;

        let filter: any = undefined;
        if (playerId) {
            filter = {
                fieldFilter: {
                    field: { fieldPath: 'player_id' },
                    op: 'EQUAL',
                    value: { stringValue: playerId }
                }
            };
        }

        const structuredQuery: Record<string, any> = {
            from: [{ collectionId: TIME_ATTACK_COLLECTION }],
            where: filter,
            // orderBy removed to avoid missing index issues on filtered queries
        };
        if (typeof limitCount === 'number' && limitCount > 0) {
            structuredQuery.limit = limitCount;
        }

        const queryBody = {
            structuredQuery,
        };

        const res = await fetch(queryUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(queryBody),
        });

        if (res.ok) {
            const results = await res.json();
            return results
                .filter((r: any) => r.document)
                .map((r: any) => {
                    const data = fromFirestoreDocument(r.document);
                    return {
                        score02_id: data._id,
                        player_id: data.player_id,
                        score02_verdict: data.score02_verdict,
                        score02_time_duration: data.score02_time_duration,
                        score02_created_date: data.score02_created_date,
                        is_online: data.is_online,
                    };
                })
                .sort((a: any, b: any) => b.score02_created_date - a.score02_created_date); // Sort in memory
        }
        return [];
    } catch (error) {
        console.warn('Firebase getTimeAttackScores failed:', error);
        return [];
    }
}

// =============================================================================
// Delete Functions
// =============================================================================

/**
 * Delete FirstToX score from Firestore
 */
export async function firebaseDeleteFirstToXScore(scoreId: string): Promise<boolean> {
    try {
        const url = `${FIRESTORE_BASE_URL}/${FIRST_TO_X_COLLECTION}/${scoreId}`;
        const res = await fetch(url, { method: 'DELETE' });
        return res.ok || res.status === 404; // 404 means already deleted
    } catch (error) {
        console.warn('Firebase deleteFirstToXScore failed:', error);
        return false;
    }
}

/**
 * Delete TimeAttack score from Firestore
 */
export async function firebaseDeleteTimeAttackScore(scoreId: string): Promise<boolean> {
    try {
        const url = `${FIRESTORE_BASE_URL}/${TIME_ATTACK_COLLECTION}/${scoreId}`;
        const res = await fetch(url, { method: 'DELETE' });
        return res.ok || res.status === 404; // 404 means already deleted
    } catch (error) {
        console.warn('Firebase deleteTimeAttackScore failed:', error);
        return false;
    }
}

