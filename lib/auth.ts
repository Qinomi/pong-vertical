/**
 * Firebase Auth REST API for Anonymous Authentication
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createInitialProfile, getUserProfile } from './firestore-user';

const FIREBASE_API_KEY = 'AIzaSyDI_iQQzW5QvyJPv5Lre8VpqdlzECEXl4o';
const AUTH_BASE_URL = 'https://identitytoolkit.googleapis.com/v1';

const AUTH_STORAGE_KEY = 'pong_auth_user';

// =============================================================================
// Types
// =============================================================================

export interface AuthUser {
    localId: string;       // User ID
    idToken: string;       // Auth token
    refreshToken: string;
    expiresIn: string;
    isAnonymous: boolean;
    displayName?: string;
}

// =============================================================================
// Auth State
// =============================================================================

let _currentUser: AuthUser | null = null;
let _authListeners: ((user: AuthUser | null) => void)[] = [];

function notifyListeners() {
    _authListeners.forEach(cb => cb(_currentUser));
}

export function subscribeToAuth(callback: (user: AuthUser | null) => void): () => void {
    _authListeners.push(callback);
    // Immediately call with current state
    callback(_currentUser);
    return () => {
        _authListeners = _authListeners.filter(cb => cb !== callback);
    };
}

export function getCurrentUser(): AuthUser | null {
    return _currentUser;
}

// =============================================================================
// Storage
// =============================================================================


async function saveUserToStorage(user: AuthUser | null): Promise<void> {
    try {
        if (user) {
            await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
        } else {
            await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
        }
    } catch (error) {
        console.warn('Failed to save auth state:', error);
    }
}

async function loadUserFromStorage(): Promise<AuthUser | null> {
    try {
        const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (error) {
        console.warn('Failed to load auth state:', error);
    }
    return null;
}

// =============================================================================
// Auth Functions
// =============================================================================

export async function signInAnonymously(): Promise<AuthUser> {
    const url = `${AUTH_BASE_URL}/accounts:signUp?key=${FIREBASE_API_KEY}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Anonymous sign in failed');
    }

    const data = await response.json();

    const user: AuthUser = {
        localId: data.localId,
        idToken: data.idToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn,
        isAnonymous: true,
        displayName: 'Guest',
    };

    _currentUser = user;
    await saveUserToStorage(user);

    // Create profile in Firestore if needed
    try {
        await createInitialProfile(user.localId, 'Guest');
        // Fetch latest name (in case it existed and was different)
        const profile = await getUserProfile(user.localId);
        if (profile && profile.displayName) {
            _currentUser.displayName = profile.displayName;
            // Save updated display name to local storage
            await saveUserToStorage(_currentUser);
        }
    } catch (e) {
        console.warn('Profile sync failed:', e);
    }

    notifyListeners();

    return user;
}

export async function signOut(): Promise<void> {
    _currentUser = null;
    await saveUserToStorage(null);
    notifyListeners();
}

export async function initAuth(): Promise<AuthUser | null> {
    const stored = await loadUserFromStorage();
    if (stored) {
        _currentUser = stored;

        // Background sync to get latest name
        getUserProfile(stored.localId).then(profile => {
            if (profile && profile.displayName && profile.displayName !== _currentUser?.displayName) {
                if (_currentUser) {
                    _currentUser.displayName = profile.displayName;
                    saveUserToStorage(_currentUser);
                    notifyListeners();
                }
            }
        }).catch(err => console.warn('Background profile sync checking failed', err));

        notifyListeners();
    }
    return _currentUser;
}

// =============================================================================
// Get Auth Token for Firestore requests
// =============================================================================

export function getAuthToken(): string | null {
    return _currentUser?.idToken || null;
}

export function getUserId(): string | null {
    return _currentUser?.localId || null;
}
