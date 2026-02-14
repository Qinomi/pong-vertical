import OnlinePongGame from '@/components/OnlinePongGame';
import { getUserId } from '@/lib/auth';
import { createOrGetPlayer } from '@/lib/db';
import { getUserProfile } from '@/lib/firestore-user';
import {
    RealtimeRoom,
    rtGetRoom,
    rtSubscribeToRoom,
    rtUpdateRoom,
    rtUpdateScore,
} from '@/lib/realtime';
import { saveFirstToXWithSync } from '@/lib/sync';
import { styles as globalStyles } from '@/styles/styles';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function OnlineGameScreen() {
    const params = useLocalSearchParams();
    const roomId = params.roomId as string;
    const target = parseInt(params.target as string) || 5;

    const [room, setRoom] = useState<RealtimeRoom | null>(null);
    const [myScore, setMyScore] = useState(0);
    const [opponentScore, setOpponentScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [winner, setWinner] = useState<'me' | 'opponent' | null>(null);
    const [isPaused, setIsPaused] = useState(false);
    const [checking, setChecking] = useState(false);
    const [isFinishing, setIsFinishing] = useState(false);

    const stopSubscriptionRef = useRef<(() => void) | null>(null);
    const gameOverRef = useRef(false);
    const userId = getUserId();
    const isPlayer1Ref = useRef<boolean | null>(null);

    // Initial room load and determine if player 1 or 2
    useEffect(() => {
        const loadRoom = async () => {
            const roomData = await rtGetRoom(roomId);
            if (roomData) {
                setRoom(roomData);
                isPlayer1Ref.current = roomData.player1_id === userId;
                console.log('Loaded room, isPlayer1:', isPlayer1Ref.current);
            }
        };
        loadRoom();
    }, [roomId, userId]);

    // Subscribe to real-time room updates for opponent score
    useEffect(() => {
        if (!roomId || gameOverRef.current) return;

        console.log('Starting realtime subscription for room:', roomId);

        stopSubscriptionRef.current = rtSubscribeToRoom(roomId, (updatedRoom) => {
            if (!updatedRoom || gameOverRef.current) return;

            setRoom(updatedRoom);

            const isPlayer1 = isPlayer1Ref.current;
            if (isPlayer1 === null) return;

            // Update opponent score
            const oppScore = isPlayer1 ? updatedRoom.player2_score : updatedRoom.player1_score;
            setOpponentScore(oppScore);

            // Check if opponent won
            if (updatedRoom.status === 'finished' && updatedRoom.winner_id) {
                if (updatedRoom.winner_id !== userId && !gameOverRef.current) {
                    gameOverRef.current = true;
                    setWinner('opponent');
                    setGameOver(true);
                }
            }

            // Check if opponent reached target
            if (oppScore >= target && !gameOverRef.current) {
                gameOverRef.current = true;
                setWinner('opponent');
                setGameOver(true);
            }
        }, 200); // Poll every 200ms for near-realtime updates

        return () => {
            if (stopSubscriptionRef.current) {
                stopSubscriptionRef.current();
            }
        };
    }, [roomId, target, userId]);

    // Handle my score change
    const handleScoreUpdate = useCallback(async (newPlayerScore: number) => {
        if (gameOverRef.current) return;

        console.log('Score update:', newPlayerScore);
        setMyScore(newPlayerScore);

        // Update score in Firebase Realtime Database immediately
        const isPlayer1 = isPlayer1Ref.current;
        if (isPlayer1 !== null) {
            await rtUpdateScore(roomId, isPlayer1, newPlayerScore);
        }

        // Check if I won
        if (newPlayerScore >= target && !gameOverRef.current) {
            gameOverRef.current = true;
            setWinner('me');
            setGameOver(true);

            // Declare winner in Firebase
            if (userId) {
                await rtUpdateRoom(roomId, { winner_id: userId, status: 'finished' });
            }
        }
    }, [roomId, target, userId]);

    // Save results and update stats
    const handleFinish = async () => {
        if (isFinishing) return;
        setIsFinishing(true);

        try {
            if (!room || !userId) {
                router.replace('/');
                return;
            }

            // Stop subscription
            if (stopSubscriptionRef.current) {
                stopSubscriptionRef.current();
            }

            // Fetch actual user name
            const userProfile = await getUserProfile(userId);
            const name = userProfile?.displayName || 'Guest';

            const player = await createOrGetPlayer(name, userId || undefined);
            const isWin = winner === 'me';

            // Determine opponent ID
            const isPlayer1 = isPlayer1Ref.current;
            const opponentIdStr = isPlayer1 ? room.player2_id : room.player1_id;
            // If opponent ID is missing (e.g. they disconnected early or null), fallback to 999 but try to get it
            const opponentId = opponentIdStr || 999;

            console.log('Saving result against opponent:', opponentId);

            // Save score to database (handles stats update internally)
            await saveFirstToXWithSync(
                {
                    playerId: player.player_id,
                    opponentId: opponentId,
                    playerScore: myScore,
                    opponentScore: opponentScore,
                    winnerId: isWin ? player.player_id : opponentId,
                    timeElapsed: 0,
                    targetScore: target,
                },
                { playerName: name, isOnlineMode: true, dedupId: roomId }
            );

            router.replace('/');
        } catch (error) {
            console.warn('Failed to finalize online match:', error);
            setIsFinishing(false);
        }
    };

    const isPlayer1 = isPlayer1Ref.current;
    const opponentName = isPlayer1 ? room?.player2_name : room?.player1_name;

    return (
        <View style={styles.container}>
            {/* HUD / Score Display */}
            <View style={styles.hudOverlay}>
                <View style={styles.pointsDisplay}>
                    <View style={[styles.pBox, styles.pBoxLeft, { borderLeftColor: '#ff00ff' }]}>
                        <Text style={styles.pLabel}>{(opponentName || 'OPPONENT').toUpperCase()}</Text>
                        <Text style={[styles.pScore, { color: '#ff00ff' }]}>{opponentScore}</Text>
                    </View>

                    <View style={[styles.pBox, styles.pBoxRight, { borderRightColor: '#00f3ff', alignItems: 'flex-end' }]}>
                        <Text style={styles.pLabel}>YOU</Text>
                        <Text style={[styles.pScore, { color: '#00f3ff' }]}>{myScore}</Text>
                    </View>
                </View>
                <Text style={styles.targetHint}>FIRST TO {target}</Text>
            </View>

            {/* Game */}
            <View style={styles.gameContainer}>
                <OnlinePongGame
                    targetScore={target}
                    onScoreChange={handleScoreUpdate}
                    onGameOver={(won) => {
                        if (won) {
                            handleScoreUpdate(target);
                        }
                    }}
                    onPause={() => setIsPaused(true)}
                    opponentName={opponentName || 'Opponent'}
                    opponentScore={opponentScore}
                    isGameOver={gameOver}
                />
            </View>

            {/* Pause Modal */}
            <Modal visible={isPaused} transparent animationType="fade" onRequestClose={() => setIsPaused(false)}>
                <View style={globalStyles.modalOverlay}>
                    <LinearGradient colors={['rgba(0,0,0,0.88)', 'rgba(0,0,0,0.65)']} style={globalStyles.menuBox}>
                        <Text style={globalStyles.menuTitle}>PAUSED</Text>
                        <Text style={globalStyles.subtitle}>Online match in progress...</Text>

                        <TouchableOpacity style={globalStyles.primaryBtn} onPress={() => setIsPaused(false)}>
                            <Text style={globalStyles.primaryBtnText}>RESUME</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={globalStyles.menuBtn} onPress={() => router.replace('/')}>
                            <Ionicons name="home" size={20} color="#fff" style={{ marginRight: 10 }} />
                            <Text style={globalStyles.menuBtnText}>QUIT (FORFEIT)</Text>
                        </TouchableOpacity>
                    </LinearGradient>
                </View>
            </Modal>

            {/* Game Over Modal */}
            <Modal visible={gameOver} transparent animationType="fade">
                <View style={globalStyles.modalOverlay}>
                    <LinearGradient colors={['rgba(0,0,0,0.92)', 'rgba(0,0,0,0.7)']} style={globalStyles.menuBox}>
                        <View style={globalStyles.winnerHeader}>
                            <Ionicons
                                name={winner === 'me' ? 'trophy' : 'skull'}
                                size={46}
                                color={winner === 'me' ? '#00f3ff' : '#ff4b2b'}
                            />
                            <Text style={[globalStyles.winnerTitle, { color: winner === 'me' ? '#00f3ff' : '#ff4b2b' }]}>
                                {winner === 'me' ? 'VICTORY' : 'DEFEAT'}
                            </Text>
                        </View>

                        <View style={globalStyles.summaryScores}>
                            <View style={globalStyles.sumRow}>
                                <Text style={globalStyles.sumLabel}>YOU</Text>
                                <Text style={[globalStyles.sumVal, { color: winner === 'me' ? '#00f3ff' : '#ff4b2b' }]}>
                                    {myScore}
                                </Text>
                            </View>

                            <View style={globalStyles.sumRowDivider} />

                            <View style={globalStyles.sumRow}>
                                <Text style={globalStyles.sumLabel}>{opponentName || 'OPPEMENT'}</Text>
                                <Text style={[globalStyles.sumVal, { color: '#ff00ff' }]}>{opponentScore}</Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={[globalStyles.primaryBtn, isFinishing && { opacity: 0.6 }]}
                            onPress={handleFinish}
                            disabled={isFinishing}
                        >
                            <Text style={globalStyles.primaryBtnText}>{isFinishing ? 'SAVING...' : 'CONTINUE'}</Text>
                        </TouchableOpacity>
                    </LinearGradient>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    gameContainer: {
        flex: 1,
    },
    // HUD Styles matching PongGame.tsx
    hudOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        paddingTop: 60,
        paddingHorizontal: 30,
    },
    pointsDisplay: { flexDirection: 'row', justifyContent: 'space-between' },
    pBox: { flex: 1 },
    pBoxLeft: { borderLeftWidth: 4, paddingLeft: 10, alignItems: 'flex-start' },
    pBoxRight: { borderRightWidth: 4, paddingRight: 10, alignItems: 'flex-end' },
    pLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '900' },
    pScore: { fontSize: 40, fontWeight: '900' },
    targetHint: { marginTop: 8, textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
});
