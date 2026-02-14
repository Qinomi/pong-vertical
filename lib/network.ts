import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

let isConnected = true;
let listeners: ((connected: boolean) => void)[] = [];

// Subscribe to network changes
NetInfo.addEventListener((state: NetInfoState) => {
    const wasConnected = isConnected;
    isConnected = state.isConnected ?? false;

    // Notify listeners if connection status changed
    if (wasConnected !== isConnected) {
        listeners.forEach(cb => cb(isConnected));
    }
});

export function getNetworkStatus(): boolean {
    return isConnected;
}

export async function checkNetworkStatus(): Promise<boolean> {
    try {
        const state = await NetInfo.fetch();
        isConnected = state.isConnected ?? false;
        return isConnected;
    } catch {
        return false;
    }
}

export function subscribeToNetworkChanges(callback: (connected: boolean) => void): () => void {
    listeners.push(callback);
    return () => {
        listeners = listeners.filter(cb => cb !== callback);
    };
}
