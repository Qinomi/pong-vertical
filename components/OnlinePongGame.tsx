import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Dimensions,
    PanResponder,
    StyleSheet,
    TouchableOpacity,
    View
} from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Constants
const PADDLE_WIDTH = 100;
const PADDLE_HEIGHT = 20;
const BALL_SIZE = 15;
const MAX_BALL_SPEED = 18; // Slightly faster for online excitement

// Types
interface OnlinePongGameProps {
    targetScore: number;
    onScoreChange: (myScore: number) => void;
    onGameOver: (won: boolean) => void;
    onPause: () => void;
    opponentName: string;
    opponentScore: number;
    isGameOver?: boolean;
}

export default function OnlinePongGame({
    targetScore,
    onScoreChange,
    onGameOver,
    onPause,
    opponentName,
    opponentScore,
    isGameOver = false,
}: OnlinePongGameProps) {
    const isFocused = useIsFocused();

    // Game State
    const [gameStarted, setGameStarted] = useState(false);
    const [myScore, setMyScore] = useState(0);
    const [arenaHeight, setArenaHeight] = useState(0);

    // Watch for external Game Over signal
    useEffect(() => {
        if (isGameOver) {
            setGameStarted(false);
        }
    }, [isGameOver]);

    // Refs for game loop (avoiding re-renders)
    const ballPos = useRef({ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 });
    const ballVel = useRef({ x: 5, y: 5 });
    const playerX = useRef(SCREEN_WIDTH / 2 - PADDLE_WIDTH / 2);
    const aiX = useRef(SCREEN_WIDTH / 2 - PADDLE_WIDTH / 2);
    const requestRef = useRef<number | null>(null);
    const scoreRef = useRef(0);

    // Animated Values for UI
    const ballX = useSharedValue(SCREEN_WIDTH / 2);
    const ballY = useSharedValue(SCREEN_HEIGHT / 2);
    const playerPaddleX = useSharedValue(SCREEN_WIDTH / 2 - PADDLE_WIDTH / 2);
    const aiPaddleX = useSharedValue(SCREEN_WIDTH / 2 - PADDLE_WIDTH / 2);

    // Helper: Clamp
    const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

    // Reset Ball
    const resetBall = useCallback((direction: 1 | -1) => {
        if (!arenaHeight) return;

        ballPos.current = {
            x: SCREEN_WIDTH / 2 - BALL_SIZE / 2,
            y: arenaHeight / 2 - BALL_SIZE / 2,
        };

        // Random angle
        const angle = (Math.random() - 0.5) * 10;
        const speed = 7; // Start speed

        ballVel.current = {
            x: angle,
            y: direction * speed,
        };

        // Update shared values for render
        ballX.value = ballPos.current.x;
        ballY.value = ballPos.current.y;
    }, [arenaHeight, ballX, ballY]);

    // Game Loop
    const update = useCallback(() => {
        if (!isFocused || !gameStarted) return; // Stop loop if not playing

        const b = ballPos.current;
        const v = ballVel.current;
        const h = arenaHeight;

        // 1. Move Ball
        b.x += v.x;
        b.y += v.y;

        // 2. Wall Collisions (Left/Right)
        if (b.x <= 0) {
            b.x = 0;
            v.x *= -1;
        } else if (b.x >= SCREEN_WIDTH - BALL_SIZE) {
            b.x = SCREEN_WIDTH - BALL_SIZE;
            v.x *= -1;
        }

        // 3. AI Movement (Insane/Perfect Tracking)
        // AI simply follows the ball perfectly
        const targetAiX = b.x - PADDLE_WIDTH / 2 + BALL_SIZE / 2;
        // Smooth lerp for visual niceness, but practically perfect
        aiX.current = aiX.current + (targetAiX - aiX.current) * 0.2;
        aiX.current = clamp(aiX.current, 0, SCREEN_WIDTH - PADDLE_WIDTH);

        // 4. Player Collision (Bottom)
        const playerY = h - 60; // Paddle inset
        if (
            v.y > 0 && // Moving down
            b.y + BALL_SIZE >= playerY && // Reached paddle level
            b.y + BALL_SIZE <= playerY + PADDLE_HEIGHT + 10 && // Still within hit zone
            b.x + BALL_SIZE >= playerX.current && // Within paddle width
            b.x <= playerX.current + PADDLE_WIDTH
        ) {
            // HIT!
            // Calculate hit position (-1 to 1)
            const hitPoint = (b.x + BALL_SIZE / 2 - (playerX.current + PADDLE_WIDTH / 2)) / (PADDLE_WIDTH / 2);

            // Reflect Y
            v.y *= -1;
            // Add speed up
            v.y = clamp(v.y * 1.05, -MAX_BALL_SPEED, MAX_BALL_SPEED);

            // Add X spin/angle
            v.x = hitPoint * 8; // Max X speed

            // Reposition to avoid sticking
            b.y = playerY - BALL_SIZE - 1;

            // *** SCORE +1 on RETURN ***
            scoreRef.current += 1;
            setMyScore(scoreRef.current);
            onScoreChange(scoreRef.current);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

            // Check Win
            if (scoreRef.current >= targetScore) {
                setGameStarted(false);
                onGameOver(true);
                return; // Stop update
            }
        }

        // 5. AI Collision (Top)
        const aiY = 60;
        if (
            v.y < 0 && // Moving up
            b.y <= aiY + PADDLE_HEIGHT &&
            b.y >= aiY - 10 &&
            b.x + BALL_SIZE >= aiX.current &&
            b.x <= aiX.current + PADDLE_WIDTH
        ) {
            // AI Hit
            const hitPoint = (b.x + BALL_SIZE / 2 - (aiX.current + PADDLE_WIDTH / 2)) / (PADDLE_WIDTH / 2);
            v.y *= -1;
            v.y = clamp(v.y * 1.05, -MAX_BALL_SPEED, MAX_BALL_SPEED);
            v.x = hitPoint * 8;
            b.y = aiY + PADDLE_HEIGHT + 1;
        }

        // 6. Missed Ball (Bottom - Player Miss)
        if (b.y > h) {
            // Player missed
            // Reset ball, no score change (or maybe penalty? User didn't ask)
            // Just reset to keep trying
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            resetBall(-1); // Serve to AI
        }

        // 7. AI Miss (Top - Impossible for Insane AI, but safety net)
        if (b.y < -50) {
            resetBall(1); // Serve to player
        }

        // Update Shared Values for UI
        ballX.value = b.x;
        ballY.value = b.y;
        aiPaddleX.value = aiX.current;

        requestRef.current = requestAnimationFrame(update);
    }, [isFocused, gameStarted, arenaHeight, onScoreChange, resetBall, targetScore, onGameOver, ballX, ballY, aiPaddleX]);

    // Start Loop
    useEffect(() => {
        if (gameStarted && !isGameOver) {
            requestRef.current = requestAnimationFrame(update);
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [gameStarted, update, isGameOver]);

    // Auto Start on Load
    useEffect(() => {
        if (arenaHeight > 0 && !gameStarted && !isGameOver) {
            // Brief delay before start
            setTimeout(() => {
                resetBall(1);
                setGameStarted(true);
            }, 1000);
        }
    }, [arenaHeight]); // Run once when arena is ready

    // Pan Responder for Player Paddle
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderMove: (_, gestureState) => {
                const newX = gestureState.moveX - PADDLE_WIDTH / 2;
                playerX.current = clamp(newX, 0, SCREEN_WIDTH - PADDLE_WIDTH);
                playerPaddleX.value = playerX.current;
            },
        })
    ).current;

    // Render Styles
    const ballStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: ballX.value }, { translateY: ballY.value }],
    }));

    const playerPaddleStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: playerPaddleX.value }],
    }));

    const aiPaddleStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: aiPaddleX.value }],
    }));

    return (
        <View
            style={styles.container}
            onLayout={(e) => setArenaHeight(e.nativeEvent.layout.height)}
            {...panResponder.panHandlers}
        >
            {/* Arena Background */}
            <LinearGradient colors={['#0a0a1a', '#1a1a2e']} style={StyleSheet.absoluteFill} />

            {/* Net / Center Line */}
            <View style={styles.net} />

            {/* AI Paddle (Top) */}
            <Animated.View style={[styles.paddle, styles.aiPaddle, aiPaddleStyle]} />

            {/* Player Paddle (Bottom) */}
            <Animated.View style={[styles.paddle, styles.playerPaddle, playerPaddleStyle]} />

            {/* Ball */}
            <Animated.View style={[styles.ball, ballStyle]} />

            {/* HUD - Settings Button */}
            <TouchableOpacity style={styles.pauseBtn} onPress={onPause}>
                <Ionicons name="pause" size={24} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>

            {/* HUD - Scores are rendered by parent, but we can show floating indicators if needed */}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        overflow: 'hidden',
    },
    net: {
        position: 'absolute',
        top: '50%',
        width: '100%',
        height: 2,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    paddle: {
        position: 'absolute',
        width: PADDLE_WIDTH,
        height: PADDLE_HEIGHT,
        borderRadius: 10,
    },
    aiPaddle: {
        top: 60,
        backgroundColor: '#ff00ff', // Opponent Color
        shadowColor: '#ff00ff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
    },
    playerPaddle: {
        bottom: 60,
        backgroundColor: '#00f3ff', // My Color
        shadowColor: '#00f3ff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
    },
    ball: {
        position: 'absolute',
        width: BALL_SIZE,
        height: BALL_SIZE,
        borderRadius: BALL_SIZE / 2,
        backgroundColor: '#fff',
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
    },
    pauseBtn: {
        position: 'absolute',
        top: 50,
        right: 20,
        padding: 10,
        zIndex: 100,
    },
});
