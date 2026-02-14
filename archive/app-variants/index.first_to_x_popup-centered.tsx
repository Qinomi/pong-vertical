import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MenuScreen() {
    const router = useRouter();
    const [showModeSelect, setShowModeSelect] = useState(false);
    const [showFirstToX, setShowFirstToX] = useState(false);
    const [showPickFirstTo, setShowPickFirstTo] = useState(false);
    const [firstToInput, setFirstToInput] = useState('5');
    const [randomizing, setRandomizing] = useState(false);
    const [randValue, setRandValue] = useState(5);
    const randScale = useRef(new Animated.Value(1)).current;

    const [playerName, setPlayerName] = useState('PLAYER 1');
    const fadeAnim = useRef(new Animated.Value(0)).current;

    const startFirstToXGame = (x: number) => {
        const safe = Math.max(1, Math.min(99, Math.trunc(x || 5)));
        setShowPickFirstTo(false);
        setShowFirstToX(false);
        setShowModeSelect(false);
        router.push({
            pathname: '/game',
            params: { mode: 'FIRST_TO_X', firstTo: String(safe), name: playerName || 'PLAYER 1' }
        });
    };

    const startRandomizeFirstToX = () => {
        // Close the selection UI and show the animation overlay.
        setShowPickFirstTo(false);
        setShowFirstToX(false);
        setShowModeSelect(false);

        setRandomizing(true);
        randScale.setValue(1);

        const min = 3;
        const max = 20;
        const stepMs = 70;
        const totalMs = 1200;

        let elapsed = 0;
        const tick = () => {
            const v = Math.floor(Math.random() * (max - min + 1)) + min;
            setRandValue(v);
        };

        tick();
        const id = setInterval(() => {
            elapsed += stepMs;
            tick();
            if (elapsed >= totalMs) {
                clearInterval(id);
                const finalV = Math.floor(Math.random() * (max - min + 1)) + min;
                setRandValue(finalV);

                Animated.sequence([
                    Animated.timing(randScale, { toValue: 1.12, duration: 140, useNativeDriver: true }),
                    Animated.timing(randScale, { toValue: 1.00, duration: 120, useNativeDriver: true }),
                ]).start(() => {
                    setRandomizing(false);
                    startFirstToXGame(finalV);
                });
            }
        }, stepMs);
    };


    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
        }).start();
    }, []);

    // background Grid Pattern component
    const GridBackground = () => (
        <View style={StyleSheet.absoluteFill}>
            {[...Array(20)].map((_, i) => (
                <View key={`v-${i}`} style={[styles.gridLineV, { left: (SCREEN_WIDTH / 10) * i }]} />
            ))}
            {[...Array(40)].map((_, i) => (
                <View key={`h-${i}`} style={[styles.gridLineH, { top: (SCREEN_HEIGHT / 20) * i }]} />
            ))}


            {/* FIRST TO X POPUP */}
            <Modal visible={showFirstToX} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.menuBoxWide}>
                        <LinearGradient colors={['#1a1a2e', '#16213e']} style={styles.menuInnerWide}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>FIRST TO X</Text>
                                <TouchableOpacity onPress={() => setShowFirstToX(false)}>
                                    <Ionicons name="close-circle" size={32} color="rgba(255,255,255,0.3)" />
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.smallHint}>Pick a win threshold, or let the arena decide (3–20).</Text>

                            <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowPickFirstTo(true)}>
                                <Ionicons name="create" size={18} color="#000" />
                                <Text style={styles.primaryBtnText}>PICK A NUMBER</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.secondaryBtn} onPress={startRandomizeFirstToX}>
                                <Ionicons name="shuffle" size={18} color="#fff" />
                                <Text style={styles.secondaryBtnText}>RANDOMIZE (3–20)</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.ghostBtn}
                                onPress={() => {
                                    // Return to mode selection (keep mode select open)
                                    setShowFirstToX(false);
                                }}
                            >
                                <Ionicons name="arrow-back" size={18} color="rgba(255,255,255,0.7)" />
                                <Text style={styles.ghostBtnText}>BACK TO MODE SELECT</Text>
                            </TouchableOpacity>
                        </LinearGradient>
                    </View>
                </View>
            </Modal>

            {/* PICK FIRST TO X NUMBER */}
            <Modal visible={showPickFirstTo} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.menuBoxWide}>
                        <LinearGradient colors={['#1a1a2e', '#16213e']} style={styles.menuInnerWide}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>SET X</Text>
                                <TouchableOpacity onPress={() => setShowPickFirstTo(false)}>
                                    <Ionicons name="close-circle" size={32} color="rgba(255,255,255,0.3)" />
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.smallHint}>Enter a number (1–99).</Text>

                            <TextInput
                                value={firstToInput}
                                onChangeText={setFirstToInput}
                                keyboardType="number-pad"
                                placeholder="e.g. 7"
                                placeholderTextColor="rgba(255,255,255,0.25)"
                                style={styles.firstToInput}
                                maxLength={2}
                            />

                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                <TouchableOpacity
                                    style={[styles.secondaryBtn, { flex: 1 }]}
                                    onPress={() => setShowPickFirstTo(false)}
                                >
                                    <Text style={styles.secondaryBtnText}>CANCEL</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.primaryBtn, { flex: 1 }]}
                                    onPress={() => {
                                        const v = parseInt(firstToInput, 10);
                                        const safe = Number.isFinite(v) ? Math.max(1, Math.min(99, v)) : 5;
                                        startFirstToXGame(safe);
                                    }}
                                >
                                    <Text style={styles.primaryBtnText}>START</Text>
                                </TouchableOpacity>
                            </View>
                        </LinearGradient>
                    </View>
                </View>
            </Modal>

            {/* RANDOMIZING OVERLAY */}
            <Modal visible={randomizing} transparent animationType="fade">
                <View style={styles.randomOverlay}>
                    <Animated.View style={[styles.randomBox, { transform: [{ scale: randScale }] }]}>
                        <Text style={styles.randomTitle}>FIRST TO</Text>
                        <Text style={styles.randomValue}>{randValue}</Text>
                        <Text style={styles.randomSub}>rolling…</Text>
                    </Animated.View>
                </View>
            </Modal>

        </View>
    );

    return (
        <View style={styles.container}>
            <StatusBar style="light" />
            <LinearGradient
                colors={['#020024', '#090979', '#00d4ff']}
                style={styles.background}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />
            <GridBackground />

            <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
                <View style={styles.titleWrapper}>
                    <Text style={styles.glowTitle}>NEO PONG</Text>
                    <Text style={styles.subtitle}>THE VERTICAL ARENA</Text>
                </View>

                <View style={styles.menuItems}>
                    <TouchableOpacity
                        activeOpacity={0.8}
                        style={styles.mainButton}
                        onPress={() => setShowModeSelect(true)}
                    >
                        <LinearGradient
                            colors={['#00f3ff', '#0072ff']}
                            style={styles.buttonGradient}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        >
                            <Text style={styles.buttonText}>START BATTLE</Text>
                            <Ionicons name="play" size={20} color="#000" />
                        </LinearGradient>
                    </TouchableOpacity>

                    <View style={styles.row}>
                        <TouchableOpacity
                            activeOpacity={0.7}
                            style={[styles.glassButton, { marginRight: 15 }]}
                            onPress={() => router.push('/history')}
                        >
                            <Ionicons name="trophy" size={22} color="#fff" style={{ marginBottom: 5 }} />
                            <Text style={styles.glassButtonText}>RANKS</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            activeOpacity={0.7}
                            style={styles.glassButton}
                            onPress={() => router.push('/settings')}
                        >
                            <Ionicons name="settings" size={22} color="#fff" style={{ marginBottom: 5 }} />
                            <Text style={styles.glassButtonText}>EDIT</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>COE64-233 • COMPUTER ENGINEERING</Text>
                </View>
            </Animated.View>

            {/* MODE SELECTION MODAL */}
            <Modal visible={showModeSelect} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <LinearGradient colors={['#1a1a2e', '#16213e']} style={styles.modalInner}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>IDENTIFY & CHOOSE</Text>
                                <TouchableOpacity onPress={() => setShowModeSelect(false)}>
                                    <Ionicons name="close-circle" size={32} color="rgba(255,255,255,0.3)" />
                                </TouchableOpacity>
                            </View>

                            {/* Name Input Before Battle */}
                            <View style={styles.inputSection}>
                                <Text style={styles.inputLabel}>PLAYER INITIALS / NAME</Text>
                                <TextInput
                                    style={styles.nameInput}
                                    value={playerName}
                                    onChangeText={setPlayerName}
                                    placeholder="ENTER NAME..."
                                    placeholderTextColor="rgba(255,255,255,0.2)"
                                    maxLength={15}
                                />
                            </View>

                            <TouchableOpacity
                                style={styles.modeCard}
                                onPress={() => {
                                    // Open the First-to-X chooser instead of starting immediately.
                                    setShowFirstToX(true);
                                }}
                            >
                                <View style={[styles.modeIcon, { backgroundColor: '#00f3ff' }]}>
                                    <Text style={styles.modeIconText}>X</Text>
                                </View>
                                <View>
                                    <Text style={styles.modeName}>FIRST TO X</Text>
                                    <Text style={styles.modeDescription}>Choose your win threshold.</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.2)" style={{ marginLeft: 'auto' }} />
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.modeCard}
                                onPress={() => {
                                    setShowModeSelect(false);
                                    router.push({
                                        pathname: '/game',
                                        params: { mode: 'TIME_ATTACK', name: playerName || 'PLAYER 1' }
                                    });
                                }}
                            >
                                <View style={[styles.modeIcon, { backgroundColor: '#ff00ff' }]}>
                                    <Ionicons name="timer" size={24} color="#fff" />
                                </View>
                                <View>
                                    <Text style={styles.modeName}>TIME ATTACK X</Text>
                                    <Text style={styles.modeDescription}>Maximum speed. 60s overload.</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.2)" style={{ marginLeft: 'auto' }} />
                            </TouchableOpacity>
                        </LinearGradient>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020024' },
    background: { ...StyleSheet.absoluteFillObject, opacity: 0.8 },
    gridLineV: { position: 'absolute', width: 1, height: '100%', backgroundColor: 'rgba(0, 243, 255, 0.05)' },
    gridLineH: { position: 'absolute', width: '100%', height: 1, backgroundColor: 'rgba(0, 243, 255, 0.05)' },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
    titleWrapper: { alignItems: 'center', marginBottom: 80 },
    glowTitle: { fontSize: 80, fontWeight: '900', color: '#fff', letterSpacing: 8, textShadowColor: '#00f3ff', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 30 },
    subtitle: { fontSize: 16, color: '#ff00ff', letterSpacing: 8, fontWeight: '800', marginTop: -5, textTransform: 'uppercase', opacity: 0.8 },
    menuItems: { width: '100%', gap: 20 },
    mainButton: { width: '100%', height: 75, borderRadius: 20, overflow: 'hidden', elevation: 15, shadowColor: '#00f3ff', shadowRadius: 20, shadowOpacity: 0.5 },
    buttonGradient: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 15 },
    buttonText: { color: '#000', fontSize: 24, fontWeight: '900', letterSpacing: 2 },
    row: { flexDirection: 'row', width: '100%' },
    glassButton: { flex: 1, height: 100, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.08)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)', justifyContent: 'center', alignItems: 'center' },
    glassButtonText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 2 },
    footer: { position: 'absolute', bottom: 40, alignItems: 'center' },
    footerText: { color: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: '900', letterSpacing: 2 },

    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 18,
    },
    modalContent: { padding: 15 },
    modalInner: { borderRadius: 30, padding: 30, borderWidth: 1, borderColor: 'rgba(0,243,255,0.3)' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
    modalTitle: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 3 },
    modeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', padding: 20, borderRadius: 20, marginBottom: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    modeIcon: { width: 50, height: 50, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 20 },
    modeIconText: { color: '#000', fontSize: 24, fontWeight: 'bold' },
    modeName: { color: '#fff', fontSize: 18, fontWeight: '900' },
    modeDescription: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 },

    // Name Input Styling
    inputSection: { marginBottom: 25, backgroundColor: 'rgba(255,255,255,0.03)', padding: 15, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    inputLabel: { color: '#00f3ff', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 10, opacity: 0.8 },
    nameInput: { color: '#fff', fontSize: 20, fontWeight: '900', paddingVertical: 5, letterSpacing: 2 }

,
    menuBoxWide: { width: '88%', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    menuInnerWide: { padding: 18 },
    smallHint: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600', marginBottom: 14 },

    primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: 14, backgroundColor: '#00f3ff', marginBottom: 12 },
    primaryBtnText: { color: '#000', fontSize: 12, fontWeight: '900', letterSpacing: 2 },

    secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', marginBottom: 12 },
    secondaryBtnText: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 2 },

    ghostBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 12, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.25)' },
    ghostBtnText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '900', letterSpacing: 2 },

    firstToInput: {
        color: '#fff',
        fontSize: 26,
        fontWeight: '900',
        textAlign: 'center',
        paddingVertical: 10,
        marginBottom: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        letterSpacing: 3,
    },

    randomOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
    randomBox: { alignItems: 'center', paddingVertical: 26, paddingHorizontal: 30, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(2,0,36,0.85)' },
    randomTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '900', letterSpacing: 4, marginBottom: 10 },
    randomValue: { color: '#00f3ff', fontSize: 72, fontWeight: '900', letterSpacing: 6, lineHeight: 80 },
    randomSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '700', marginTop: 8 }

});


