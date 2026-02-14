import { getLeaderboard, UserProfile } from '@/lib/firestore-user';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function LeaderboardScreen() {
    const router = useRouter();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchLeaderboard = useCallback(async () => {
        return getLeaderboard(50);
    }, []);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        fetchLeaderboard()
            .then((data) => {
                if (!alive) return;
                setUsers(data);
            })
            .finally(() => {
                if (!alive) return;
                setLoading(false);
            });

        return () => {
            alive = false;
        };
    }, [fetchLeaderboard]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const data = await fetchLeaderboard();
            setUsers(data);
        } finally {
            setRefreshing(false);
        }
    }, [fetchLeaderboard]);

    const renderItem = ({ item, index }: { item: UserProfile; index: number }) => (
        <View style={styles.itemContainer}>
            <View style={styles.rankBox}>
                <Text style={styles.rankText}>{index + 1}</Text>
            </View>
            <View style={styles.infoBox}>
                <Text style={styles.nameText}>{item.displayName}</Text>
                <Text style={styles.dateText}>
                    Last Active: {new Date(item.updatedAt).toLocaleDateString()}
                </Text>
            </View>
            <View style={styles.scoreBox}>
                <Text style={styles.scoreText}>{item.count_win || 0} Wins</Text>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#1a1a2e', '#16213e', '#0f3460']}
                style={styles.gradient}
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="#00f3ff" />
                    </TouchableOpacity>
                    <Text style={styles.title}>HALL OF FAME</Text>
                    <View style={styles.backBtn} />
                </View>

                {/* Content */}
                {loading ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color="#00f3ff" />
                    </View>
                ) : (
                    <FlatList
                        data={users}
                        renderItem={renderItem}
                        keyExtractor={(item) => item.uid}
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={
                            <View style={styles.center}>
                                <Text style={styles.emptyText}>No data available</Text>
                            </View>
                        }
                    />
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
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 60,
        paddingHorizontal: 20,
        paddingBottom: 20,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    backBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: 2,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: 20,
    },
    itemContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 15,
        padding: 15,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    rankBox: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 243, 255, 0.1)',
        borderRadius: 20,
        marginRight: 15,
        borderWidth: 1,
        borderColor: 'rgba(0, 243, 255, 0.3)',
    },
    rankText: {
        color: '#00f3ff',
        fontSize: 18,
        fontWeight: '900',
    },
    infoBox: {
        flex: 1,
    },
    nameText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 4,
    },
    dateText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
    },
    scoreBox: {
        alignItems: 'flex-end',
    },
    scoreText: {
        color: '#ff00ff',
        fontSize: 16,
        fontWeight: '900',
    },
    emptyText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 16,
    },
});
