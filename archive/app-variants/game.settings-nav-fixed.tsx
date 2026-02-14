import { GameMode, GameResult, PongGame } from '@/components/PongGame';
import { saveScore } from '@/lib/db';
import { styles } from '@/styles/styles';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';

export default function GameScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const mode = (params.mode as GameMode) || 'FIRST_TO_5';

    const [isPaused, setIsPaused] = useState(false);
    const [gameOverState, setGameOverState] = useState<'NONE' | 'INPUT' | 'CHECKING' | 'SUMMARY'>('NONE');
    const [result, setResult] = useState<GameResult | null>(null);
    const [playerName, setPlayerName] = useState((params.name as string) || 'PLAYER 1');
    const [isOnline, setIsOnline] = useState(true);

    const handleGameOver = (res: GameResult) => {
        setResult(res);
        // Step 1: Skip input, go to sync check as name was set at menu
        proceedToSync();
    };

    const proceedToSync = () => {
        setGameOverState('CHECKING');
        // Simulate "Checking Internet" as per flowchart
        setTimeout(() => {
            // Randomly simulate offline/online for demonstration of the flow
            const online = Math.random() > 0.1;
            setIsOnline(online);
            setGameOverState('SUMMARY');
        }, 2000);
    };

    const handleFinalSave = async () => {
        if (result) {
            await saveScore(playerName, result.playerScore); // Saves to SQLite (Local)
            // Flowchart says: ไปหน้าแสดงผลคะแนน Leaderboard
            router.replace('/history');
        }
    };

    return (
        <View style={styles.container}>
            <PongGame
                mode={mode}
                onGameOver={handleGameOver}
                onPausePress={() => setIsPaused(true)}
                onOptionsPress={() => router.push('/settings')}
                isExternalPaused={isPaused}
            />

            {/* PAUSE MODAL (Per Flowchart) */}
            <Modal visible={isPaused} transparent={true} animationType="fade">
                <View style={styles.modalOverlay}>
                    <LinearGradient colors={['#1a1a2e', '#16213e']} style={styles.menuBox}>
                        <Text style={styles.menuTitle}>PAUSED</Text>

                        <TouchableOpacity style={styles.menuBtn} onPress={() => setIsPaused(false)}>
                            <Text style={styles.menuBtnText}>RESUME</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.menuBtn} onPress={() => {
                            setIsPaused(false);
                            router.push('/settings');
                        }}>
                            <Ionicons name="settings" size={20} color="#fff" style={{ marginRight: 10 }} />
                            <Text style={styles.menuBtnText}>SETTINGS</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.menuBtn, { borderColor: '#ff4b2b' }]} onPress={() => router.replace('/')}>
                            <Text style={[styles.menuBtnText, { color: '#ff4b2b' }]}>QUIT GAME</Text>
                        </TouchableOpacity>
                    </LinearGradient>
                </View>
            </Modal>

            {/* END GAME FLOW MODALS */}
            {/* Step 1 & 2 combined: Checking Status directly after game ends */}

            {/* 2. CHECKING INTERNET (Simulating Flowchart) */}
            <Modal visible={gameOverState === 'CHECKING'} transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.checkingBox}>
                        <ActivityIndicator size="large" color="#00f3ff" />
                        <Text style={styles.checkingText}>CHECKING INTERNET STATUS...</Text>
                        <Text style={styles.subText}>SYNCING WITH ONLINE DATABASE</Text>
                    </View>
                </View>
            </Modal>

            {/* 3. SUMMARY & STATUS (Final Step in Flowchart) */}
            <Modal visible={gameOverState === 'SUMMARY'} transparent={true} animationType="fade">
                <View style={styles.modalOverlay}>
                    <LinearGradient colors={['#1a1a2e', '#16213e']} style={styles.menuBox}>
                        <View style={styles.winnerHeader}>
                            <Ionicons
                                name={result && result.playerScore > result.aiScore ? "trophy" : "skull"}
                                size={60}
                                color={result && result.playerScore > result.aiScore ? "#FFD700" : "#ff4b2b"}
                            />
                            <Text style={[styles.winnerTitle, { color: result && result.playerScore > result.aiScore ? "#00f3ff" : "#ff4b2b" }]}>
                                {result && result.playerScore > result.aiScore ? "PLAYER WINS!" : "AI DOMINANCE"}
                            </Text>
                        </View>

                        <View style={styles.summaryScores}>
                            <View style={styles.sumRow}>
                                <Text style={styles.sumLabel}>YOUR SCORE</Text>
                                <Text style={[styles.sumVal, { color: '#00f3ff' }]}>{result?.playerScore}</Text>
                            </View>
                            <View style={styles.sumRowDivider} />
                            <View style={styles.sumRow}>
                                <Text style={styles.sumLabel}>AI SCORE</Text>
                                <Text style={[styles.sumVal, { color: '#ff00ff' }]}>{result?.aiScore}</Text>
                            </View>
                        </View>

                        <View style={styles.syncStatusLine}>
                            <Ionicons
                                name={isOnline ? "cloud-done" : "cloud-offline"}
                                size={16}
                                color={isOnline ? "#00f3ff" : "#ff4b2b"}
                            />
                            <Text style={[styles.statusText, { color: isOnline ? "#00f3ff" : "#ff4b2b" }]}>
                                {isOnline ? "CONNECTED. SYNC SUCCESSFUL" : "OFFLINE. SAVED LATER"}
                            </Text>
                        </View>

                        <TouchableOpacity style={styles.primaryBtn} onPress={handleFinalSave}>
                            <Text style={styles.primaryBtnText}>VIEW LEADERBOARD</Text>
                        </TouchableOpacity>
                    </LinearGradient>
                </View>
            </Modal>
        </View>
    );
}
