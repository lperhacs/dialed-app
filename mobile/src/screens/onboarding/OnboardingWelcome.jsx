import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

const { width } = Dimensions.get('window');

// Fixed x positions so server-side rendering is stable
const REACTION_POSITIONS = [
  { x: 28,  emoji: '♥', delay: 0 },
  { x: 72,  emoji: '♥', delay: 160 },
  { x: 130, emoji: '♥', delay: 80 },
  { x: 190, emoji: '♥', delay: 280 },
  { x: 245, emoji: '♥', delay: 40 },
  { x: 295, emoji: '♥', delay: 200 },
  { x: 340, emoji: '♥', delay: 120 },
  { x: width - 48, emoji: '♥', delay: 320 },
];

function ReactionBubble({ x, emoji, delay, anim, reactionStyle }) {
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -220] });
  const opacity = anim.interpolate({
    inputRange: [0, 0.15, 0.7, 1],
    outputRange: [0, 1, 0.9, 0],
  });
  const scale = anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1.1, 0.8] });

  return (
    <Animated.Text
      style={[
        reactionStyle,
        { left: x, transform: [{ translateY }, { scale }], opacity },
      ]}
    >
      {emoji}
    </Animated.Text>
  );
}

export default function OnboardingWelcome({ route, onDone }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { habitName = 'their first habit', displayName = 'You' } = route?.params ?? {};
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const name = user?.display_name || displayName;
  const habit = habitName;

  const anims = useRef(REACTION_POSITIONS.map(() => new Animated.Value(0))).current;
  const cardScale = useRef(new Animated.Value(0.88)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Card slides in
    Animated.parallel([
      Animated.spring(cardScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();

    // 2. Reactions fire after card appears
    const reactionAnimations = REACTION_POSITIONS.map((pos, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(pos.delay + 600),
          Animated.timing(anims[i], { toValue: 1, duration: 1600, useNativeDriver: true }),
          Animated.timing(anims[i], { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.delay(600 + i * 100),
        ])
      )
    );
    Animated.parallel(reactionAnimations).start();

    // 3. Bottom text fades in after 1.2s
    const textTimer = setTimeout(() => {
      Animated.timing(textOpacity, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    }, 1200);

    return () => {
      reactionAnimations.forEach(a => a.stop());
      clearTimeout(textTimer);
    };
  }, []);

  const handleDone = async () => {
    await AsyncStorage.setItem('dialed_onboarding_done', 'true');
    onDone?.();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.center}>
        {/* The "welcome post" card */}
        <Animated.View style={[styles.card, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}>
          <View style={styles.cardHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={styles.cardName}>{name}</Text>
              <Text style={styles.cardHandle}>@{user?.username ?? 'you'}</Text>
            </View>
          </View>

          <View style={styles.habitTag}>
            <Text style={styles.habitTagText}>Day 1 · {habit}</Text>
          </View>

          <Text style={styles.cardContent}>
            {name} just committed to <Text style={styles.boldAccent}>{habit}</Text>.{'\n'}Day 1 starts today.
          </Text>

          <View style={styles.cardFooter}>
            <Text style={styles.footerLikes}>♥ 0</Text>
            <Text style={styles.footerTime}>Just now</Text>
          </View>
        </Animated.View>

        {/* Floating reactions */}
        <View style={styles.reactionsLayer} pointerEvents="none">
          {REACTION_POSITIONS.map((pos, i) => (
            <ReactionBubble key={i} x={pos.x} emoji={pos.emoji} delay={pos.delay} anim={anims[i]} reactionStyle={styles.reaction} />
          ))}
        </View>
      </View>

      {/* Bottom section */}
      <Animated.View style={[styles.bottom, { paddingBottom: insets.bottom + 24, opacity: textOpacity }]}>
        <Text style={styles.tagline}>Your community is watching.</Text>
        <Text style={styles.taglineBold}>Stay Dialed.</Text>
        <TouchableOpacity style={styles.cta} onPress={handleDone} activeOpacity={0.85}>
          <Text style={styles.ctaText}>Let's Go</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

function makeStyles(colors) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xxl },
  card: {
    width: '100%',
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.accentDimBorder,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 10 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: 'white', fontSize: 15, fontWeight: '700' },
  cardName: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardHandle: { fontSize: 12, color: colors.textMuted },
  habitTag: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: radius.pill, borderWidth: 1,
    borderColor: colors.accent, backgroundColor: colors.accentDim,
    marginBottom: 10,
  },
  habitTagText: { fontSize: 12, fontWeight: '600', color: colors.accent },
  cardContent: { fontSize: 15, color: colors.text, lineHeight: 22, marginBottom: 12 },
  boldAccent: { fontWeight: '700', color: colors.accent },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerLikes: { fontSize: 13, color: colors.textMuted },
  footerTime: { fontSize: 11, color: colors.textDim },
  reactionsLayer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  reaction: { position: 'absolute', bottom: 40, fontSize: 26, color: colors.accent },
  bottom: {
    paddingHorizontal: spacing.xxl,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    alignItems: 'center',
    gap: 4,
  },
  tagline: { fontSize: 17, color: colors.textMuted, textAlign: 'center' },
  taglineBold: { fontSize: 26, fontWeight: '900', color: colors.text, letterSpacing: -0.5, marginBottom: 16 },
  cta: {
    backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingVertical: 16, width: '100%', alignItems: 'center',
  },
  ctaText: { color: 'white', fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
}); }
