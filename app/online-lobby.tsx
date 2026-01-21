import { getUserId } from '@/lib/auth';
import {
    RealtimeRoom,
    rtCreateRoom,
    rtDeleteRoom,
    rtFindWaitingRoom,
    rtGetRoom,
    rtSubscribeToRoom,
    rtUpdateRoom
} from '@/lib/realtime';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type LobbyState = 'searching' | 'waiting' | 'countdown' | 'error';

// Target options for random selection
const TARGET_OPTIONS = [3, 5, 7, 10];

export default function OnlineLobbyScreen() {
    const [state, setState] = useState<LobbyState>('searching');
    const [room, setRoom] = useState<RealtimeRoom | null>(null);
    const [countdown, setCountdown] = useState(3);
    const [error, setError] = useState<string | null>(null);
    const [playerName, setPlayerName] = useState('Guest');

    const stopSubscriptionRef = useRef<(() => void) | null>(null);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const roomIdRef = useRef<string | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (stopSubscriptionRef.current) stopSubscriptionRef.current();
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, []);

    // Start matchmaking
    useEffect(() => {
        const init = async () => {
            let currentName = 'Guest';
            try {
                const { getCurrentUser } = await import('@/lib/auth');
                const user = getCurrentUser();
                if (user?.displayName) {
                    currentName = user.displayName;
                    setPlayerName(currentName);
                }
            } catch (e) {
                console.warn('Failed to load user name', e);
            }
            startMatchmaking(currentName);
        };
        init();
    }, []);

    const startMatchmaking = async (nameOverride?: string) => {
        setState('searching');
        setError(null);

        const effectiveName = nameOverride || playerName;

        const userId = getUserId();
        if (!userId) {
            setError('Please login first');
            setState('error');
            return;
        }

        console.log('Looking for waiting room...');

        // Try to find existing room first
        const existingRoom = await rtFindWaitingRoom(userId);

        if (existingRoom) {
            console.log('Found room, joining:', existingRoom.room_id);

            // Join existing room
            const joined = await rtUpdateRoom(existingRoom.room_id, {
                player2_id: userId,
                player2_name: effectiveName,
                status: 'countdown',
            });

            if (joined) {
                roomIdRef.current = existingRoom.room_id;
                const updatedRoom = await rtGetRoom(existingRoom.room_id);
                setRoom(updatedRoom);
                setState('countdown');
                startCountdown(updatedRoom!);
                return;
            }
        }

        console.log('No room found, creating new one...');

        // No room found, create new one
        const roomData = {
            status: 'waiting' as const,
            target: TARGET_OPTIONS[Math.floor(Math.random() * TARGET_OPTIONS.length)],
            player1_id: userId,
            player1_name: effectiveName,
            player1_score: 0,
            player2_id: null,
            player2_name: null,
            player2_score: 0,
            winner_id: null,
            created_at: Date.now(),
        };

        const newRoomId = await rtCreateRoom(roomData);
        if (!newRoomId) {
            setError('Failed to create room');
            setState('error');
            return;
        }

        roomIdRef.current = newRoomId;
        setRoom({ room_id: newRoomId, ...roomData });
        setState('waiting');

        console.log('Created room:', newRoomId, 'waiting for player 2...');

        // Subscribe to room updates - waiting for player 2
        stopSubscriptionRef.current = rtSubscribeToRoom(newRoomId, (updatedRoom) => {
            if (updatedRoom) {
                setRoom(updatedRoom);

                // Check if player 2 joined
                if (updatedRoom.status === 'countdown' && updatedRoom.player2_id) {
                    console.log('Player 2 joined!', updatedRoom.player2_name);
                    if (stopSubscriptionRef.current) stopSubscriptionRef.current();
                    setState('countdown');
                    startCountdown(updatedRoom);
                }
            }
        }, 500); // Check every 500ms for player 2
    };

    const startCountdown = (roomData: RealtimeRoom) => {
        setCountdown(3);

        countdownRef.current = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    if (countdownRef.current) clearInterval(countdownRef.current);

                    // Update room status to playing
                    rtUpdateRoom(roomData.room_id, { status: 'playing' });

                    // Navigate to game - use setTimeout to avoid setState during render
                    setTimeout(() => {
                        router.replace({
                            pathname: '/online-game',
                            params: {
                                roomId: roomData.room_id,
                                target: String(roomData.target),
                            },
                        });
                    }, 0);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const handleCancel = async () => {
        if (stopSubscriptionRef.current) stopSubscriptionRef.current();
        if (countdownRef.current) clearInterval(countdownRef.current);

        // Delete room if we created it
        if (roomIdRef.current && state === 'waiting') {
            await rtDeleteRoom(roomIdRef.current);
        }

        router.back();
    };

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#020024', '#1a237e', '#080808']}
                style={styles.gradient}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>ONLINE MATCH</Text>
                    <Text style={styles.subtitle}>FIRST TO X</Text>

                    <TouchableOpacity
                        style={styles.leaderboardBtn}
                        onPress={() => router.push('/leaderboard')}
                    >
                        <Ionicons name="trophy" size={20} color="#ffd700" />
                        <Text style={styles.leaderboardText}>LEADERBOARD</Text>
                    </TouchableOpacity>
                </View>

                {/* Status Box */}
                <View style={styles.statusBox}>
                    {state === 'searching' && (
                        <>
                            <ActivityIndicator size="large" color="#00f3ff" />
                            <Text style={styles.statusText}>Searching for opponent...</Text>
                        </>
                    )}

                    {state === 'waiting' && (
                        <>
                            <View style={styles.waitingIcon}>
                                <Ionicons name="people" size={48} color="#00f3ff" />
                            </View>
                            <Text style={styles.statusText}>Waiting for opponent...</Text>
                            <Text style={styles.roomInfo}>Room: {room?.room_id?.slice(0, 8)}...</Text>
                            <Text style={styles.targetInfo}>Target: First to {room?.target}</Text>
                        </>
                    )}

                    {state === 'countdown' && (
                        <>
                            <Text style={styles.foundText}>OPPONENT FOUND!</Text>
                            <View style={styles.playersRow}>
                                <View style={styles.playerCard}>
                                    <Ionicons name="person" size={24} color="#00f3ff" />
                                    <Text style={styles.playerName}>{room?.player1_name || 'Player 1'}</Text>
                                </View>
                                <Text style={styles.vsText}>VS</Text>
                                <View style={styles.playerCard}>
                                    <Ionicons name="person" size={24} color="#ff00ff" />
                                    <Text style={styles.playerName}>{room?.player2_name || 'Player 2'}</Text>
                                </View>
                            </View>
                            <Text style={styles.targetInfo}>First to {room?.target}</Text>
                            <View style={styles.countdownBox}>
                                <Text style={styles.countdownNum}>{countdown}</Text>
                            </View>
                            <Text style={styles.getReadyText}>GET READY!</Text>
                        </>
                    )}

                    {state === 'error' && (
                        <>
                            <Ionicons name="warning" size={48} color="#ff4b2b" />
                            <Text style={styles.errorText}>{error}</Text>
                            <TouchableOpacity style={styles.retryBtn} onPress={() => startMatchmaking()}>
                                <Text style={styles.retryBtnText}>RETRY</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>

                {/* Cancel Button */}
                {state !== 'countdown' && (
                    <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
                        <Ionicons name="close" size={20} color="#fff" />
                        <Text style={styles.cancelBtnText}>CANCEL</Text>
                    </TouchableOpacity>
                )}
            </LinearGradient>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    gradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
    },
    header: {
        alignItems: 'center',
        marginBottom: 40,
    },
    title: {
        fontSize: 36,
        fontWeight: '900',
        color: '#00f3ff',
        letterSpacing: 4,
    },
    subtitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#ff00ff',
        letterSpacing: 3,
        marginTop: 5,
    },
    statusBox: {
        width: '100%',
        maxWidth: 350,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 20,
        padding: 40,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0, 243, 255, 0.3)',
        minHeight: 250,
        justifyContent: 'center',
    },
    waitingIcon: {
        marginBottom: 20,
    },
    statusText: {
        fontSize: 18,
        color: '#fff',
        marginTop: 20,
        textAlign: 'center',
    },
    roomInfo: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.4)',
        marginTop: 15,
    },
    targetInfo: {
        fontSize: 16,
        color: '#00f3ff',
        marginTop: 10,
        fontWeight: '700',
    },
    foundText: {
        fontSize: 24,
        fontWeight: '900',
        color: '#00ff88',
        marginBottom: 20,
        letterSpacing: 2,
    },
    playersRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    playerCard: {
        alignItems: 'center',
        padding: 15,
    },
    playerName: {
        fontSize: 14,
        color: '#fff',
        marginTop: 8,
    },
    vsText: {
        fontSize: 20,
        fontWeight: '900',
        color: 'rgba(255, 255, 255, 0.5)',
        marginHorizontal: 20,
    },
    countdownBox: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(0, 243, 255, 0.2)',
        borderWidth: 3,
        borderColor: '#00f3ff',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 20,
    },
    countdownNum: {
        fontSize: 48,
        fontWeight: '900',
        color: '#00f3ff',
    },
    getReadyText: {
        fontSize: 16,
        color: '#ff00ff',
        marginTop: 15,
        fontWeight: '700',
        letterSpacing: 2,
    },
    errorText: {
        fontSize: 16,
        color: '#ff4b2b',
        marginTop: 15,
        textAlign: 'center',
    },
    retryBtn: {
        marginTop: 20,
        backgroundColor: '#1a237e',
        paddingVertical: 12,
        paddingHorizontal: 30,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#00f3ff',
    },
    retryBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    cancelBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 30,
        paddingVertical: 12,
        paddingHorizontal: 25,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    cancelBtnText: {
        fontSize: 14,
        color: '#fff',
        marginLeft: 8,
    },
    leaderboardBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 215, 0, 0.1)',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 215, 0, 0.3)',
        marginTop: 15,
    },
    leaderboardText: {
        color: '#ffd700',
        fontSize: 12,
        fontWeight: '700',
        marginLeft: 8,
        letterSpacing: 1,
    },
});
