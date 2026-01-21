import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },

    // Luxury Menu Box
    menuBox: {
        width: '95%',
        padding: 30,
        borderRadius: 35,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        shadowColor: '#00f3ff',
        shadowRadius: 50,
        shadowOpacity: 0.2
    },

    menuTitle: { fontSize: 42, fontWeight: '900', color: '#fff', marginBottom: 10, letterSpacing: 5, textTransform: 'uppercase' },
    subtitle: { color: 'rgba(255,255,255,0.5)', marginBottom: 35, fontSize: 13, fontWeight: '700', letterSpacing: 2 },

    // Action Buttons
    menuBtn: {
        width: '100%',
        height: 65,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 15,
        flexDirection: 'row'
    },
    menuBtnText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1 },

    // Primary Action
    primaryBtn: {
        width: '100%',
        height: 70,
        backgroundColor: '#00f3ff',
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
        elevation: 10,
        shadowColor: '#00f3ff',
        shadowRadius: 20,
        shadowOpacity: 0.5
    },
    primaryBtnText: { color: '#000', fontSize: 22, fontWeight: '900', letterSpacing: 2 },

    // Form Input
    input: {
        width: '100%',
        height: 70,
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 20,
        paddingHorizontal: 25,
        color: '#fff',
        fontSize: 22,
        marginBottom: 25,
        borderWidth: 1,
        borderColor: '#00f3ff',
        textAlign: 'center',
        fontWeight: '900'
    },

    // Winner Header
    winnerHeader: { alignItems: 'center', marginBottom: 25 },
    winnerTitle: { fontSize: 28, fontWeight: '900', marginTop: 10, letterSpacing: 2 },

    // End Game Summary
    summaryScores: {
        width: '100%',
        padding: 25,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 25,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)'
    },
    sumRowDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 15 },
    sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sumLabel: { color: 'rgba(255,255,255,0.4)', fontWeight: '900', fontSize: 11, letterSpacing: 2 },
    sumVal: { color: '#fff', fontSize: 32, fontWeight: '900' },

    // Status
    syncStatusLine: { flexDirection: 'row', alignItems: 'center', marginBottom: 25, gap: 8 },
    statusText: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
    checkingBox: { alignItems: 'center' },
    checkingText: { color: '#fff', fontSize: 18, marginTop: 25, fontWeight: '900', letterSpacing: 3 },
    subText: { color: 'rgba(255,255,255,0.3)', marginTop: 8, fontSize: 12, fontWeight: '700' }
});
