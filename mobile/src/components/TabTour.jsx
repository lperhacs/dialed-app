import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { radius, spacing } from '../theme';

const TOUR_KEY = 'dialed_tab_tour_v1';

// ─── Step 1: Feed ─────────────────────────────────────────────────────────────

function FeedIllustration({ colors }) {
  const heartScale = useRef(new Animated.Value(1)).current;
  const heartFilled = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(1000),
        Animated.parallel([
          Animated.spring(heartScale, { toValue: 1.55, tension: 200, friction: 5, useNativeDriver: true }),
          Animated.timing(heartFilled, { toValue: 1, duration: 120, useNativeDriver: false }),
        ]),
        Animated.spring(heartScale, { toValue: 1, tension: 200, friction: 7, useNativeDriver: true }),
        Animated.delay(2200),
        Animated.timing(heartFilled, { toValue: 0, duration: 180, useNativeDriver: false }),
        Animated.delay(300),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const heartColor = heartFilled.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.textDim, colors.accent],
  });

  const posts = [
    { initials: 'JM', color: '#34d399', name: 'Jordan M.', handle: '@jordan_m', day: 12, habit: 'Morning Run', text: 'Day 12. Was dark and cold but I showed up anyway.' },
    { initials: 'SC', color: '#8b5cf6', name: 'Sofia C.',  handle: '@sofia_c',  day: 5,  habit: 'Read Daily',  text: 'Finished another chapter. This habit is quietly changing my life.' },
  ];

  return (
    <View style={{ gap: 10 }}>
      {posts.map((p, i) => (
        <View key={i} style={[il.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <View style={[il.avatar, { backgroundColor: p.color }]}>
              <Text style={il.avatarText}>{p.initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[il.cardName, { color: colors.text }]}>{p.name}</Text>
              <Text style={[il.cardSub, { color: colors.textDim }]}>{p.handle}</Text>
            </View>
            <View style={[il.tag, { borderColor: p.color, backgroundColor: p.color + '18' }]}>
              <Text style={[il.tagText, { color: p.color }]}>Day {p.day} · {p.habit}</Text>
            </View>
          </View>
          <Text style={[il.body, { color: colors.textMuted }]}>{p.text}</Text>
          {i === 0 && (
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 9 }}>
              <Animated.Text style={{ fontSize: 19, transform: [{ scale: heartScale }], color: heartColor }}>
                ♥
              </Animated.Text>
              <Text style={{ fontSize: 17, color: colors.textDim }}>○</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

// ─── Step 2: Habits ───────────────────────────────────────────────────────────

function HabitsIllustration({ colors }) {
  const btnScale    = useRef(new Animated.Value(1)).current;
  const newDot      = useRef(new Animated.Value(0)).current;
  const badgeOpacity= useRef(new Animated.Value(0)).current;
  const badgeScale  = useRef(new Animated.Value(0.65)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(800),
        Animated.spring(btnScale, { toValue: 0.90, tension: 260, friction: 7, useNativeDriver: true }),
        Animated.spring(btnScale, { toValue: 1, tension: 260, friction: 7, useNativeDriver: true }),
        Animated.timing(newDot, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.parallel([
          Animated.spring(badgeScale, { toValue: 1, tension: 130, friction: 7, useNativeDriver: true }),
          Animated.timing(badgeOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        ]),
        Animated.delay(2000),
        Animated.timing(newDot, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(badgeOpacity, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(badgeScale, { toValue: 0.65, duration: 0, useNativeDriver: true }),
        Animated.delay(300),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const filledDots = [1, 1, 1, 1, 1, 0, 0];

  return (
    <View style={[il.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle, borderLeftColor: colors.accent, borderLeftWidth: 3 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <View>
          <Text style={[il.cardName, { color: colors.text, fontSize: 16 }]}>Morning Run</Text>
          <Text style={[il.cardSub, { color: colors.textDim }]}>daily · 47 logs</Text>
        </View>
        <Animated.View style={[
          il.badge,
          { backgroundColor: colors.accentDim, borderColor: colors.accent },
          { opacity: badgeOpacity, transform: [{ scale: badgeScale }] },
        ]}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.accent }}>7 day streak</Text>
        </Animated.View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 16 }}>
        {filledDots.map((filled, i) => (
          <View key={i} style={[il.dot, { backgroundColor: filled ? colors.accent : colors.bgHover }]} />
        ))}
        <Animated.View style={[il.dot, { backgroundColor: colors.accent, opacity: newDot }]} />
      </View>

      <Animated.View style={{ transform: [{ scale: btnScale }] }}>
        <View style={[il.logBtn, { backgroundColor: colors.accent }]}>
          <Text style={{ color: colors.bg, fontWeight: '700', fontSize: 13 }}>Log Today</Text>
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Step 3: Events ───────────────────────────────────────────────────────────

function EventsIllustration({ colors }) {
  const fanProgress = useRef(new Animated.Value(0)).current;
  const btnScale    = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(800),
        Animated.spring(btnScale, { toValue: 0.86, tension: 260, friction: 7, useNativeDriver: true }),
        Animated.spring(btnScale, { toValue: 1, tension: 260, friction: 7, useNativeDriver: true }),
        Animated.spring(fanProgress, { toValue: 1, tension: 55, friction: 9, useNativeDriver: true }),
        Animated.delay(2000),
        Animated.timing(fanProgress, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.delay(300),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const postY    = fanProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -76] });
  const postX    = fanProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -54] });
  const eventY   = fanProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -76] });
  const eventX   = fanProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 54] });
  const fanAlpha = fanProgress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] });

  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      <View style={[il.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle, flexDirection: 'row', gap: 10, alignItems: 'center', alignSelf: 'stretch' }]}>
        <View style={[il.dateBox, { backgroundColor: colors.accentDim }]}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: colors.accent, letterSpacing: 0.4 }}>SAT</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.accent, lineHeight: 26 }}>24</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[il.cardName, { color: colors.text }]}>Morning Run Group</Text>
          <Text style={[il.cardSub, { color: colors.textMuted }]}>7:00 AM · Riverside Park</Text>
          <Text style={[il.cardSub, { color: colors.textDim, marginTop: 2 }]}>3 going</Text>
        </View>
      </View>

      {/* Fan menu demo */}
      <View style={{ height: 116, alignItems: 'center', justifyContent: 'flex-end' }}>
        <Animated.View style={[il.fanItem, { opacity: fanAlpha, transform: [{ translateX: postX }, { translateY: postY }] }]}>
          <View style={[il.fanCircle, { backgroundColor: colors.accent }]}>
            <Text style={{ fontSize: 16 }}>✏️</Text>
          </View>
          <Text style={{ fontSize: 10, fontWeight: '600', color: colors.text, marginTop: 3 }}>Post</Text>
        </Animated.View>
        <Animated.View style={[il.fanItem, { opacity: fanAlpha, transform: [{ translateX: eventX }, { translateY: eventY }] }]}>
          <View style={[il.fanCircle, { backgroundColor: '#5B6EF5' }]}>
            <Text style={{ fontSize: 16 }}>📅</Text>
          </View>
          <Text style={{ fontSize: 10, fontWeight: '600', color: colors.text, marginTop: 3 }}>Event</Text>
        </Animated.View>
        <Animated.View style={{ transform: [{ scale: btnScale }] }}>
          <View style={[il.plusBtn, { backgroundColor: colors.accent }]}>
            <Text style={{ fontSize: 28, color: colors.bg, fontWeight: '300', lineHeight: 36, marginTop: -2 }}>+</Text>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

// ─── Step 4: Clubs ────────────────────────────────────────────────────────────

function ClubsIllustration({ colors }) {
  const rows = [
    { rank: 1, name: 'Jordan M.', streak: 42, color: colors.accent },
    { rank: 2, name: 'You',       streak: 38, color: '#60a5fa' },
    { rank: 3, name: 'Sofia C.',  streak: 31, color: '#a78bfa' },
  ];
  const anims = useRef(rows.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const build = () => rows.map((_, i) =>
      Animated.timing(anims[i], { toValue: 1, duration: 360, useNativeDriver: true })
    );
    const loop = Animated.loop(
      Animated.sequence([
        Animated.stagger(160, build()),
        Animated.delay(2400),
        ...rows.map((_, i) => Animated.timing(anims[i], { toValue: 0, duration: 0, useNativeDriver: true })),
        Animated.delay(400),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={[il.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 14 }}>
        Morning Run Club
      </Text>
      {rows.map((row, i) => (
        <Animated.View key={i} style={[
          il.leaderRow,
          { borderBottomColor: colors.borderSubtle, borderBottomWidth: i < rows.length - 1 ? 1 : 0 },
          {
            opacity: anims[i],
            transform: [{ translateX: anims[i].interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }],
          },
        ]}>
          <Text style={{ fontSize: 13, fontWeight: '700', width: 26, color: i === 0 ? colors.accent : colors.textMuted }}>
            #{row.rank}
          </Text>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.text }}>{row.name}</Text>
          <View style={[il.streakChip, { borderColor: row.color, backgroundColor: row.color + '18' }]}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: row.color }}>{row.streak}d</Text>
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

// ─── Step 5: Profile ──────────────────────────────────────────────────────────

function ProfileIllustration({ colors }) {
  const buddyScale  = useRef(new Animated.Value(1)).current;
  const statsOpacity= useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(statsOpacity, { toValue: 1, duration: 700, useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(1600),
        Animated.spring(buddyScale, { toValue: 1.07, tension: 200, friction: 6, useNativeDriver: true }),
        Animated.spring(buddyScale, { toValue: 1,    tension: 200, friction: 6, useNativeDriver: true }),
        Animated.delay(2000),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={[il.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <View style={[il.profileAvatar, { backgroundColor: colors.accent }]}>
          <Text style={{ color: colors.bg, fontSize: 20, fontWeight: '700' }}>YO</Text>
        </View>
        <Text style={[il.cardName, { color: colors.text, marginTop: 10, fontSize: 16 }]}>You</Text>
        <Text style={[il.cardSub, { color: colors.textDim, marginTop: 2 }]}>@yourhandle</Text>
      </View>
      <Animated.View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 18, opacity: statsOpacity }}>
        {[['47', 'streak'], ['12', 'habits'], ['8', 'friends']].map(([val, label]) => (
          <View key={label} style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{val}</Text>
            <Text style={{ fontSize: 11, color: colors.textDim, marginTop: 2 }}>{label}</Text>
          </View>
        ))}
      </Animated.View>
      <Animated.View style={{ transform: [{ scale: buddyScale }] }}>
        <View style={[il.buddyBtn, { borderColor: colors.accent, backgroundColor: colors.accentDim }]}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.accent }}>Buddy up</Text>
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Illustration shared styles (no dynamic colors) ───────────────────────────

const il = StyleSheet.create({
  card:         { borderRadius: 12, padding: 14, borderWidth: 1 },
  avatar:       { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  avatarText:   { color: 'white', fontSize: 11, fontWeight: '700' },
  cardName:     { fontSize: 13, fontWeight: '700' },
  cardSub:      { fontSize: 11, marginTop: 1 },
  body:         { fontSize: 12, lineHeight: 17 },
  tag:          { borderWidth: 1, borderRadius: 100, paddingHorizontal: 7, paddingVertical: 2 },
  tagText:      { fontSize: 9, fontWeight: '700' },
  badge:        { borderWidth: 1, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3 },
  dot:          { width: 9, height: 9, borderRadius: 5 },
  logBtn:       { borderRadius: 7, paddingVertical: 10, alignItems: 'center' },
  dateBox:      { width: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  fanItem:      { position: 'absolute', alignItems: 'center', bottom: 0 },
  fanCircle:    { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  plusBtn:      { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  leaderRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 },
  streakChip:   { borderWidth: 1, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3 },
  profileAvatar:{ width: 62, height: 62, borderRadius: 31, justifyContent: 'center', alignItems: 'center' },
  buddyBtn:     { borderWidth: 1.5, borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
});

// ─── Steps config ─────────────────────────────────────────────────────────────

const STEPS = [
  {
    title: 'Your feed',
    desc: 'See every habit your circle is logging. Tap the heart to cheer them on - it goes straight to their phone.',
    Illustration: FeedIllustration,
  },
  {
    title: 'Track your habits',
    desc: 'One tap to log. Set a daily goal or something like 4 days a week. Your streak grows with every log.',
    Illustration: HabitsIllustration,
  },
  {
    title: 'Dial in with others',
    desc: 'Tap the + button in the tab bar to create a post or event. Invite your circle to show up together.',
    Illustration: EventsIllustration,
  },
  {
    title: 'Clubs',
    desc: 'Group challenges where everyone logs together. The leaderboard shows who\'s keeping up - join one or create your own.',
    Illustration: ClubsIllustration,
  },
  {
    title: 'Profile & buddy',
    desc: 'Your stats and streaks live here. Tap "Buddy up" on anyone\'s profile - they\'ll see every time you log or miss.',
    Illustration: ProfileIllustration,
  },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function TabTour() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const opacity   = useRef(new Animated.Value(0)).current;
  const translateY= useRef(new Animated.Value(20)).current;

  useEffect(() => {
    AsyncStorage.getItem(TOUR_KEY).then(done => {
      if (!done) setVisible(true);
    });
  }, []);

  useEffect(() => {
    if (visible) animateIn();
  }, [visible]);

  const animateIn = () => {
    translateY.setValue(20);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
    ]).start();
  };

  const goToStep = (next) => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 0, duration: 130, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -16, duration: 130, useNativeDriver: true }),
    ]).start(() => {
      setStep(next);
      translateY.setValue(20);
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
      ]).start();
    });
  };

  const next = () => {
    if (step < STEPS.length - 1) goToStep(step + 1);
    else dismiss();
  };

  const dismiss = async () => {
    Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(async () => {
      await AsyncStorage.setItem(TOUR_KEY, 'true');
      setVisible(false);
    });
  };

  if (!visible) return null;

  const { title, desc, Illustration } = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Modal visible={visible} transparent={false} animationType="none" onRequestClose={dismiss}>
      <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}>

        {/* Skip */}
        {!isLast && (
          <TouchableOpacity style={styles.skipBtn} onPress={dismiss} hitSlop={12}>
            <Text style={[styles.skipText, { color: colors.textDim }]}>Skip</Text>
          </TouchableOpacity>
        )}

        {/* Illustration */}
        <Animated.View style={[styles.illustrationArea, { opacity, transform: [{ translateY }] }]}>
          <Illustration colors={colors} />
        </Animated.View>

        {/* Bottom content */}
        <Animated.View style={[
          styles.bottom,
          { paddingBottom: insets.bottom + 24, borderTopColor: colors.borderSubtle },
          { opacity, transform: [{ translateY }] },
        ]}>
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: i === step ? colors.accent : colors.border },
                  i === step && styles.dotActive,
                ]}
              />
            ))}
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.desc, { color: colors.textMuted }]}>{desc}</Text>

          <TouchableOpacity style={[styles.nextBtn, { backgroundColor: colors.accent }]} onPress={next} activeOpacity={0.85}>
            <Text style={[styles.nextBtnText, { color: colors.bg }]}>{isLast ? 'Got it' : 'Next'}</Text>
          </TouchableOpacity>
        </Animated.View>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  skipBtn: { position: 'absolute', top: 14, right: spacing.lg, zIndex: 10 },
  skipText: { fontSize: 14, fontWeight: '500' },
  illustrationArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 44,
    paddingBottom: 16,
  },
  bottom: {
    paddingHorizontal: spacing.xxl,
    paddingTop: 24,
    borderTopWidth: 1,
  },
  dots:       { flexDirection: 'row', gap: 6, marginBottom: 18 },
  dot:        { width: 6, height: 6, borderRadius: 3 },
  dotActive:  { width: 20 },
  title:      { fontSize: 24, fontWeight: '700', letterSpacing: -0.4, marginBottom: 8 },
  desc:       { fontSize: 14, lineHeight: 21, marginBottom: 24 },
  nextBtn:    { borderRadius: radius.sm, paddingVertical: 14, alignItems: 'center' },
  nextBtnText:{ fontSize: 15, fontWeight: '700' },
});
