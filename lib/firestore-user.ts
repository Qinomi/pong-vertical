/**
 * Firestore User Profile Management
 * Handles creating and updating user profiles (ID, Name) in Firestore
 */


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

/**
 * Get user profile from Firestore
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
        const url = `${FIRESTORE_BASE_URL}/${USERS_COLLECTION}/${userId}`;
        const res = await fetch(url);

        if (res.ok) {
            const doc = await res.json();
            const data = fromFirestoreDocument(doc);
            return {
                uid: userId, // Document ID is the User ID
                displayName: data.displayName || 'Guest',
                createdAt: data.createdAt || Date.now(),
                updatedAt: data.updatedAt || Date.now(),
                count_win: data.count_win || 0,
            };
        }
        return null;
    } catch (error) {
        console.warn('getUserProfile error:', error);
        return null;
    }
}

/**
 * Create or Update user profile
 */
export async function updateUserProfile(userId: string, displayName: string): Promise<boolean> {
    try {
        const url = `${FIRESTORE_BASE_URL}/${USERS_COLLECTION}/${userId}`;
        const now = Date.now();
        const data = {
            displayName,
            updatedAt: now,
        };

        const res = await fetch(`${url}?updateMask.fieldPaths=displayName&updateMask.fieldPaths=updatedAt`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toFirestoreDocument(data)),
        });

        return res.ok;
    } catch (error) {
        console.warn('updateUserProfile error:', error);
        return false;
    }
}

/**
 * Increment user win count
 */
/**
 * Increment user win count
 */
export async function incrementUserWin(userId: string): Promise<void> {
    try {
        // Correct endpoint for commit is on the database root
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
 * Get Leaderboard (Top 50 users by win count)
 */
export async function getLeaderboard(limit: number = 50): Promise<UserProfile[]> {
    try {
        // Firestore REST API runQuery for sorting
        const url = `${FIRESTORE_BASE_URL}:runQuery`;

        const query = {
            structuredQuery: {
                from: [{ collectionId: USERS_COLLECTION }],
                orderBy: [
                    { field: { fieldPath: 'count_win' }, direction: 'DESCENDING' }
                ],
                limit: limit
            }
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(query),
        });

        if (res.ok) {
            const list = await res.json();
            // result is array of { document: ..., readTime: ... } or empty

            return list.map((item: any) => {
                if (!item.document) return null;
                const data = fromFirestoreDocument(item.document);
                // Extract ID from document name pathname
                const nameParts = item.document.name.split('/');
                const id = nameParts[nameParts.length - 1];

                return {
                    uid: id,
                    displayName: data.displayName || 'Guest',
                    createdAt: data.createdAt || 0,
                    updatedAt: data.updatedAt || 0,
                    count_win: data.count_win || 0,
                };
            }).filter(Boolean);
        }
        return [];
    } catch (error) {
        console.warn('getLeaderboard error:', error);
        return [];
    }
}

/**
 * Create initial profile if it doesn't exist
 */
export async function createInitialProfile(userId: string, defaultName: string = 'Guest'): Promise<void> {
    const existing = await getUserProfile(userId);
    if (!existing) {
        const createUrl = `${FIRESTORE_BASE_URL}/${USERS_COLLECTION}/${userId}`;
        const now = Date.now();
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
    }
}
