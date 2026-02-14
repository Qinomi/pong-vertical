import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_USER_STORAGE_KEY = 'pong_auth_user_v1';
const GUEST_DEVICE_ID_STORAGE_KEY = 'pong_guest_device_id_v1';
const LAST_GUEST_UID_STORAGE_KEY = 'pong_last_guest_uid_v1';
const LAST_GUEST_NAME_STORAGE_KEY = 'pong_last_guest_name_v1';

export type AuthUser = {
  uid: string;
  displayName: string;
  isAnonymous: boolean;
};

let currentUser: AuthUser | null = null;
const listeners = new Set<(user: AuthUser | null) => void>();
let initPromise: Promise<void> | null = null;

function emitAuthChanged(): void {
  for (const listener of listeners) {
    listener(currentUser);
  }
}

function generateGuestId(): string {
  return `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateGuestName(): string {
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `Guest${suffix}`;
}

async function getOrCreateGuestDeviceId(): Promise<string> {
  const lastUid = await AsyncStorage.getItem(LAST_GUEST_UID_STORAGE_KEY);
  if (typeof lastUid === 'string' && lastUid.trim().length > 0) {
    const normalized = lastUid.trim();
    // Heal primary key if it is missing.
    const existingPrimary = await AsyncStorage.getItem(GUEST_DEVICE_ID_STORAGE_KEY);
    if (!existingPrimary || existingPrimary.trim().length === 0) {
      await AsyncStorage.setItem(GUEST_DEVICE_ID_STORAGE_KEY, normalized);
    }
    return normalized;
  }

  const existing = await AsyncStorage.getItem(GUEST_DEVICE_ID_STORAGE_KEY);
  if (typeof existing === 'string' && existing.trim().length > 0) {
    const normalized = existing.trim();
    await AsyncStorage.setItem(LAST_GUEST_UID_STORAGE_KEY, normalized);
    return normalized;
  }

  const nextId = generateGuestId();
  await AsyncStorage.setItem(GUEST_DEVICE_ID_STORAGE_KEY, nextId);
  await AsyncStorage.setItem(LAST_GUEST_UID_STORAGE_KEY, nextId);
  return nextId;
}

async function persistUser(user: AuthUser | null): Promise<void> {
  if (!user) {
    await AsyncStorage.removeItem(AUTH_USER_STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
}

export async function initAuth(): Promise<void> {
  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(AUTH_USER_STORAGE_KEY);
      if (!raw) {
        currentUser = null;
        return;
      }

      const parsed = JSON.parse(raw) as Partial<AuthUser>;
      if (typeof parsed?.uid === 'string') {
        currentUser = {
          uid: parsed.uid,
          displayName: typeof parsed.displayName === 'string' && parsed.displayName.trim().length > 0
            ? parsed.displayName.trim()
            : 'Guest',
          isAnonymous: parsed.isAnonymous !== false,
        };
      } else {
        currentUser = null;
      }
    } catch (error) {
      console.warn('initAuth failed:', error);
      currentUser = null;
    } finally {
      emitAuthChanged();
      initPromise = null;
    }
  })();

  await initPromise;
}

export function subscribeToAuth(listener: (user: AuthUser | null) => void): () => void {
  listeners.add(listener);
  listener(currentUser);
  return () => listeners.delete(listener);
}

export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

export function getUserId(): string | null {
  return currentUser?.uid ?? null;
}

export async function signInAnonymously(displayName?: string): Promise<AuthUser> {
  const stableGuestId = await getOrCreateGuestDeviceId();
  const localLastName = await AsyncStorage.getItem(LAST_GUEST_NAME_STORAGE_KEY);

  let resolvedName = displayName?.trim() || localLastName?.trim() || generateGuestName();

  // Try to keep local auth name aligned with online profile name (same UID).
  try {
    const { getUserProfile } = await import('./firestore-user');
    const profile = await getUserProfile(stableGuestId);
    if (profile?.displayName && profile.displayName.trim().length > 0) {
      resolvedName = profile.displayName.trim();
    }
  } catch {
    // Offline/unavailable profile lookup; keep local fallback name.
  }

  const user: AuthUser = {
    uid: stableGuestId,
    displayName: resolvedName,
    isAnonymous: true,
  };

  currentUser = user;
  await persistUser(user);
  await AsyncStorage.setItem(LAST_GUEST_UID_STORAGE_KEY, user.uid);
  await AsyncStorage.setItem(LAST_GUEST_NAME_STORAGE_KEY, user.displayName);
  emitAuthChanged();
  return user;
}

export async function signOut(): Promise<void> {
  currentUser = null;
  await persistUser(null);
  emitAuthChanged();
}

export async function updateCurrentUserDisplayName(displayName: string): Promise<void> {
  if (!currentUser) return;

  const nextName = displayName.trim();
  if (!nextName) return;

  currentUser = {
    ...currentUser,
    displayName: nextName,
  };

  await persistUser(currentUser);
  await AsyncStorage.setItem(LAST_GUEST_NAME_STORAGE_KEY, currentUser.displayName);
  emitAuthChanged();
}
