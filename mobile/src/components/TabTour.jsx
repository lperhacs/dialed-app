import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { radius, spacing } from '../theme';

const TOUR_KEY = 'dialed_tab_tour_v1';

const STEPS = [
  {
    icon: 'home',
    title: 'Your feed',
    desc: 'See every habit your circle is logging. Cheer them on, comment, and stay in the loop with people who are actually showing up.',
  },
  {
    icon: 'radio-button-on',
    title: 'Track your habits',
    desc: 'Set your goal - daily, 4 days a week, whatever fits your life. One tap to log. Build your streak, hit milestones, and share your progress to the feed.',
  },
  {
    icon: 'calendar',
    title: 'Dial in with others',
    desc: 'Create events and invite your circle to show up together - a morning run, a workout, a study session. Tap the + button to get one going.',
  },
  {
    icon: 'people',
    title: 'Clubs',
    desc: 'Group challenges where everyone logs together. Join an existing club or create your own - the leaderboard shows who\'s keeping up.',
  },
  {
    icon: 'person',
    title: 'Profile & buddy',
    desc: 'Your stats, streaks, and badges live here. Tap "Buddy up" on any profile to add an accountability partner - they\'ll see every time you log (or don\'t).',
  },
];

export default function TabTour() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    AsyncStorage.getItem(TOUR_KEY).then(done => {
      if (!done) setVisible(true);
    });
  }, []);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const animateToNext = (cb) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 16, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      cb();
      slideAnim.setValue(-16);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      ]).start();
    });
  };

  const next = () => {
    if (step < STEPS.length - 1) {
      animateToNext(() => setStep(s => s + 1));
    } else {
      dismiss();
    }
  };

  const dismiss = async () => {
    await AsyncStorage.setItem(TOUR_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        {/* Tapping outside dismisses */}
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={dismiss} activeOpacity={1} />

        <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.iconWrap}>
            <Ionicons name={current.icon} size={30} color={colors.accent} />
          </View>

          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.desc}>{current.desc}</Text>

          {/* Dots */}
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>

          <TouchableOpacity style={styles.nextBtn} onPress={next} activeOpacity={0.85}>
            <Text style={styles.nextBtnText}>{isLast ? 'Got it' : 'Next'}</Text>
          </TouchableOpacity>

          {!isLast && (
            <TouchableOpacity onPress={dismiss} style={styles.skipBtn} hitSlop={10}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
      paddingHorizontal: spacing.lg,
      paddingBottom: 100, // sits above tab bar
    },
    card: {
      backgroundColor: colors.bgCard,
      borderRadius: radius.lg,
      padding: 28,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 12,
    },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.accentDim,
      borderWidth: 1,
      borderColor: colors.accentDimBorder,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
      letterSpacing: -0.3,
    },
    desc: {
      fontSize: 14,
      color: colors.textMuted,
      lineHeight: 21,
      marginBottom: 24,
    },
    dots: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 20,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
    },
    dotActive: {
      backgroundColor: colors.accent,
      width: 18,
    },
    nextBtn: {
      backgroundColor: colors.accent,
      borderRadius: radius.sm,
      paddingVertical: 13,
      alignItems: 'center',
      marginBottom: 12,
    },
    nextBtnText: {
      color: colors.bg,
      fontSize: 15,
      fontWeight: '700',
    },
    skipBtn: {
      alignItems: 'center',
      paddingVertical: 4,
    },
    skipText: {
      fontSize: 13,
      color: colors.textDim,
    },
  });
}
