import { signInAnonymously } from '@/lib/auth';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function LoginScreen() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const handleGuestLogin = async () => {
        setLoading(true);
        setError(null);

        try {
            await signInAnonymously();
            router.replace('/');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#020024', '#1a237e', '#080808']}
                style={styles.gradient}
            >
                {/* Logo / Title */}
                <View style={styles.header}>
                    <Text style={styles.title}>PONG</Text>
                    <Text style={styles.subtitle}>NEON ARENA</Text>
                </View>

                {/* Login Options */}
                <View style={styles.loginBox}>
                    <Text style={styles.welcomeText}>Welcome!</Text>
                    <Text style={styles.descText}>Sign in to save your scores online</Text>

                    {error && (
                        <View style={styles.errorBox}>
                            <Ionicons name="warning" size={16} color="#ff4b2b" />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    <TouchableOpacity
                        style={styles.guestBtn}
                        onPress={handleGuestLogin}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Ionicons name="person-outline" size={24} color="#fff" style={styles.btnIcon} />
                                <Text style={styles.guestBtnText}>GUEST</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <Text style={styles.hintText}>
                        Play as guest with anonymous account
                    </Text>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>More login options coming soon</Text>
                </View>
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
        marginBottom: 60,
    },
    title: {
        fontSize: 64,
        fontWeight: '900',
        color: '#00f3ff',
        textShadowColor: '#00f3ff',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 20,
        letterSpacing: 8,
    },
    subtitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#ff00ff',
        letterSpacing: 6,
        marginTop: 5,
    },
    loginBox: {
        width: '100%',
        maxWidth: 350,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        borderRadius: 20,
        padding: 30,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0, 243, 255, 0.2)',
    },
    welcomeText: {
        fontSize: 28,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 8,
    },
    descText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        textAlign: 'center',
        marginBottom: 30,
    },
    errorBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 75, 43, 0.2)',
        borderRadius: 10,
        padding: 12,
        marginBottom: 20,
        width: '100%',
    },
    errorText: {
        color: '#ff4b2b',
        marginLeft: 8,
        fontSize: 13,
    },
    guestBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1a237e',
        borderRadius: 15,
        paddingVertical: 18,
        paddingHorizontal: 40,
        width: '100%',
        borderWidth: 2,
        borderColor: '#00f3ff',
    },
    btnIcon: {
        marginRight: 12,
    },
    guestBtnText: {
        fontSize: 20,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: 3,
    },
    hintText: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.4)',
        marginTop: 15,
        textAlign: 'center',
    },
    footer: {
        position: 'absolute',
        bottom: 40,
    },
    footerText: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.3)',
    },
});
