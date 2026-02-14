import { styles } from '@/styles/styles';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Overlay =
  | 'NONE'
  | 'MODE'
  | 'FIRST_TO_X_MENU'
  | 'FIRST_TO_X_INPUT'
  | 'TIME_ATTACK_MENU'
  | 'TIME_ATTACK_INPUT'
  | 'RANDOMIZING';

type RandomKind = 'FIRST_TO_X' | 'TIME_ATTACK';

const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

export default function HomeScreen() {
  const [name, setName] = useState('YOU');

  const [overlay, setOverlay] = useState<Overlay>('NONE');

  // First to X input
  const [firstToInput, setFirstToInput] = useState('5');
  const firstToRef = useRef<TextInput>(null);

  // Time attack seconds input
  const [secondsInput, setSecondsInput] = useState('60');
  const secondsRef = useRef<TextInput>(null);

  // Randomizing animation
  const [randKind, setRandKind] = useState<RandomKind>('FIRST_TO_X');
  const [randValue, setRandValue] = useState<number>(5);
  const [randScale, setRandScale] = useState<number>(1);

  const startFirstTo5 = () => {
    setOverlay('NONE');
    router.push({ pathname: '/game', params: { mode: 'FIRST_TO_5', name } });
  };

  const startFirstToX = (x: number) => {
    const safeX = Math.max(1, Math.min(99, Math.trunc(x)));
    setOverlay('NONE');
    router.push({ pathname: '/game', params: { mode: 'FIRST_TO_X', firstTo: String(safeX), name } });
  };

  const startTimeAttack = (seconds: number) => {
    const safe = Math.max(10, Math.min(999, Math.trunc(seconds)));
    setOverlay('NONE');
    router.push({ pathname: '/game', params: { mode: 'TIME_ATTACK', seconds: String(safe), name } });
  };

  const beginRandomize = (kind: RandomKind) => {
    setRandKind(kind);
    setOverlay('RANDOMIZING');

    let ticks = 0;
    let final = kind === 'FIRST_TO_X' ? randInt(3, 20) : randInt(30, 300);

    setRandValue(final);
    setRandScale(1);

    const id = setInterval(() => {
      ticks += 1;
      final = kind === 'FIRST_TO_X' ? randInt(3, 20) : randInt(30, 300);
      setRandValue(final);
      setRandScale(1 + (ticks % 2 === 0 ? 0.06 : 0.02));

      if (ticks >= 18) {
        clearInterval(id);
        setRandScale(1.22);

        setTimeout(() => {
          if (kind === 'FIRST_TO_X') startFirstToX(final);
          else startTimeAttack(final);
        }, 420);
      }
    }, 55);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#020024', '#1a237e', '#080808']} style={{ flex: 1, paddingTop: 90, paddingHorizontal: 20 }}>
        <Text style={styles.menuTitle}>PONG</Text>
        <Text style={styles.subtitle}>NEON ARENA</Text>

        <TouchableOpacity style={styles.menuBtn} onPress={() => setOverlay('MODE')}>
          <Ionicons name="play" size={20} color="#fff" style={{ marginRight: 10 }} />
          <Text style={styles.menuBtnText}>PLAY</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuBtn} onPress={() => router.push('/settings')}>
          <Ionicons name="options" size={20} color="#fff" style={{ marginRight: 10 }} />
          <Text style={styles.menuBtnText}>SETTINGS</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuBtn} onPress={() => router.push('/history')}>
          <Ionicons name="list" size={20} color="#fff" style={{ marginRight: 10 }} />
          <Text style={styles.menuBtnText}>HISTORY</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuBtn} onPress={() => router.push('/leaderboard')}>
          <Ionicons name="trophy" size={20} color="#fff" style={{ marginRight: 10 }} />
          <Text style={styles.menuBtnText}>HALL OF FAME</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* MODE SELECTION */}
      <Modal visible={overlay === 'MODE'} transparent animationType="fade" onRequestClose={() => setOverlay('NONE')}>
        <View style={styles.modalOverlay}>
          <LinearGradient colors={['rgba(0,0,0,0.92)', 'rgba(0,0,0,0.75)']} style={styles.menuBox}>
            <Text style={styles.menuTitle}>GAME MODE</Text>
            <Text style={styles.subtitle}>Choose your protocol.</Text>

            <TouchableOpacity style={styles.menuBtn} onPress={() => setOverlay('FIRST_TO_X_MENU')}>
              <Ionicons name="keypad" size={20} color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.menuBtnText}>FIRST TO X</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuBtn} onPress={() => router.push('/online-lobby')}>
              <Ionicons name="globe" size={20} color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.menuBtnText}>FIRST TO X ONLINE</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuBtn} onPress={() => setOverlay('TIME_ATTACK_MENU')}>
              <Ionicons name="time" size={20} color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.menuBtnText}>TIME ATTACK</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryBtn} onPress={() => setOverlay('NONE')}>
              <Text style={styles.primaryBtnText}>CLOSE</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </Modal>

      {/* FIRST TO X MENU */}
      <Modal visible={overlay === 'FIRST_TO_X_MENU'} transparent animationType="fade" onRequestClose={() => setOverlay('MODE')}>
        <View style={styles.modalOverlay}>
          <LinearGradient colors={['rgba(0,0,0,0.92)', 'rgba(0,0,0,0.75)']} style={styles.menuBox}>
            <Text style={styles.menuTitle}>FIRST TO X</Text>
            <Text style={styles.subtitle}>Pick a threshold, or randomize (3–20).</Text>

            <TouchableOpacity
              style={styles.menuBtn}
              onPress={() => {
                setFirstToInput('5');
                setOverlay('FIRST_TO_X_INPUT');
                setTimeout(() => firstToRef.current?.focus(), 100);
              }}
            >
              <Ionicons name="create" size={20} color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.menuBtnText}>PICK A NUMBER</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuBtn} onPress={() => beginRandomize('FIRST_TO_X')}>
              <Ionicons name="dice" size={20} color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.menuBtnText}>RANDOMIZE</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryBtn} onPress={() => setOverlay('MODE')}>
              <Text style={styles.primaryBtnText}>BACK</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </Modal>

      {/* FIRST TO X INPUT */}
      <Modal
        visible={overlay === 'FIRST_TO_X_INPUT'}
        transparent
        animationType="fade"
        onRequestClose={() => setOverlay('FIRST_TO_X_MENU')}
      >
        <View style={styles.modalOverlay}>
          <LinearGradient colors={['rgba(0,0,0,0.92)', 'rgba(0,0,0,0.75)']} style={styles.menuBox}>
            <Text style={styles.menuTitle}>SET X</Text>
            <Text style={styles.subtitle}>Enter a number (1–99).</Text>

            <TextInput
              ref={firstToRef}
              style={styles.input}
              keyboardType="number-pad"
              value={firstToInput}
              onChangeText={(t) => setFirstToInput(t.replace(/[^\d]/g, '').slice(0, 2))}
              placeholder="5"
              placeholderTextColor="rgba(255,255,255,0.25)"
              returnKeyType="done"
            />

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                const x = parseInt(firstToInput || '5', 10);
                startFirstToX(Number.isFinite(x) ? x : 5);
              }}
            >
              <Text style={styles.primaryBtnText}>START</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuBtn} onPress={() => setOverlay('FIRST_TO_X_MENU')}>
              <Ionicons name="arrow-back" size={20} color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.menuBtnText}>BACK</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </Modal>

      {/* TIME ATTACK MENU */}
      <Modal visible={overlay === 'TIME_ATTACK_MENU'} transparent animationType="fade" onRequestClose={() => setOverlay('MODE')}>
        <View style={styles.modalOverlay}>
          <LinearGradient colors={['rgba(0,0,0,0.92)', 'rgba(0,0,0,0.75)']} style={styles.menuBox}>
            <Text style={styles.menuTitle}>TIME ATTACK</Text>
            <Text style={styles.subtitle}>Survive X seconds, or randomize (30–300).</Text>

            <TouchableOpacity
              style={styles.menuBtn}
              onPress={() => {
                setSecondsInput('60');
                setOverlay('TIME_ATTACK_INPUT');
                setTimeout(() => secondsRef.current?.focus(), 100);
              }}
            >
              <Ionicons name="create" size={20} color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.menuBtnText}>PICK SECONDS</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuBtn} onPress={() => beginRandomize('TIME_ATTACK')}>
              <Ionicons name="dice" size={20} color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.menuBtnText}>RANDOMIZE</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryBtn} onPress={() => setOverlay('MODE')}>
              <Text style={styles.primaryBtnText}>BACK</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </Modal>

      {/* TIME ATTACK INPUT */}
      <Modal
        visible={overlay === 'TIME_ATTACK_INPUT'}
        transparent
        animationType="fade"
        onRequestClose={() => setOverlay('TIME_ATTACK_MENU')}
      >
        <View style={styles.modalOverlay}>
          <LinearGradient colors={['rgba(0,0,0,0.92)', 'rgba(0,0,0,0.75)']} style={styles.menuBox}>
            <Text style={styles.menuTitle}>SET TIME</Text>
            <Text style={styles.subtitle}>Enter seconds to survive.</Text>

            <TextInput
              ref={secondsRef}
              style={styles.input}
              keyboardType="number-pad"
              value={secondsInput}
              onChangeText={(t) => setSecondsInput(t.replace(/[^\d]/g, '').slice(0, 3))}
              placeholder="60"
              placeholderTextColor="rgba(255,255,255,0.25)"
              returnKeyType="done"
            />

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                const s = parseInt(secondsInput || '60', 10);
                startTimeAttack(Number.isFinite(s) ? s : 60);
              }}
            >
              <Text style={styles.primaryBtnText}>START</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuBtn} onPress={() => setOverlay('TIME_ATTACK_MENU')}>
              <Ionicons name="arrow-back" size={20} color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.menuBtnText}>BACK</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </Modal>

      {/* RANDOMIZING */}
      <Modal visible={overlay === 'RANDOMIZING'} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <LinearGradient colors={['rgba(0,0,0,0.92)', 'rgba(0,0,0,0.75)']} style={styles.menuBox}>
            <Text style={styles.menuTitle}>{randKind === 'FIRST_TO_X' ? 'FIRST TO' : 'SURVIVE'}</Text>
            <Text style={styles.subtitle}>
              {randKind === 'FIRST_TO_X' ? 'LOCKING THRESHOLD…' : 'CALIBRATING TIMER…'}
            </Text>

            <View style={{ marginTop: 10, marginBottom: 10 }}>
              <Text
                style={{
                  fontSize: 70,
                  fontWeight: '900',
                  color: '#00f3ff',
                  textAlign: 'center',
                  transform: [{ scale: randScale }],
                }}
              >
                {randValue}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: '900', letterSpacing: 2, textAlign: 'center' }}>
                {randKind === 'FIRST_TO_X' ? 'POINTS' : 'SECONDS'}
              </Text>
            </View>

            <Text style={styles.subText}>You can still go back after the match.</Text>
          </LinearGradient>
        </View>
      </Modal>
    </View>
  );
}
