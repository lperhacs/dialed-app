import React, { useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

const DEMO_FEED = [
  {
    id: '1', name: 'Jordan Miller', handle: 'jordan_m', initials: 'JM',
    habitName: 'Morning Run', day: 12, avatarColor: '#34d399', habitColor: '#34d399',
    content: 'Day 12 of morning runs. Was dark and cold outside but showed up anyway.',
    likes: 24, comments: ["Let's go!", 'Proud of you!'],
  },
  {
    id: '2', name: 'Sofia Chen', handle: 'sofia_c', initials: 'SC',
    habitName: 'Read Daily', day: 5, avatarColor: '#8b5cf6', habitColor: '#8b5cf6',
    content: 'Finished another chapter before bed. Day 5 of reading before sleep — this habit is quietly changing my life.',
    likes: 31, comments: ['Night reading is everything', 'What book are you on?'],
  },
  {
    id: '3', name: 'Marcus Reid', handle: 'marc_r', initials: 'MR',
    habitName: 'Meditation', day: 21, avatarColor: '#3b82f6', habitColor: '#3b82f6',
    content: '21 days straight. Not missing this one.',
    likes: 47, comments: ['Incredible consistency', 'Goals right here!'],
  },
  {
    id: '4', name: 'Aaliyah James', handle: 'aaliyah_j', initials: 'AJ',
    habitName: 'Drink More Water', day: 8, avatarColor: '#22c55e', habitColor: '#22c55e',
    content: "Day 8, didn't miss a single day this week. Feeling the difference.",
    likes: 18, comments: ['Hydration is everything', 'I noticed the same!'],
  },
  {
    id: '5', name: 'Tyler Brooks', handle: 'tyler_b', initials: 'TB',
    habitName: 'Journaling', day: 3, avatarColor: '#fbbf24', habitColor: '#fbbf24',
    content: 'Day 1 felt hard. Day 3 already feels like second nature.',
    likes: 22, comments: ['Day 1 is always the hardest!', 'Same journey right here'],
  },
  {
    id: '6', name: 'Nina Patel', handle: 'nina_p', initials: 'NP',
    habitName: 'Workout', day: 30, avatarColor: '#ef4444', habitColor: '#ef4444',
    content: "30 days. Didn't think I'd make it past day 5. Look at us now.",
    likes: 89, comments: ['NINA!!!', 'Absolute legend', 'Inspired by you every day'],
  },
  {
    id: '7', name: 'Cam Nguyen', handle: 'cam_n', initials: 'CN',
    habitName: 'Learn Spanish', day: 14, avatarColor: '#8b5cf6', habitColor: '#8b5cf6',
    content: 'Two weeks of Spanish. Started with 10 minutes a day — now I cannot stop.',
    likes: 35, comments: ['Hola amigo!', 'Same, started last month'],
  },
  {
    id: '8', name: 'Brooke Sullivan', handle: 'brooke_s', initials: 'BS',
    habitName: 'Morning Run', day: 1, avatarColor: '#34d399', habitColor: '#34d399',
    content: 'Day 1. Nervous but ready. Here we go.',
    likes: 41, comments: ["We're rooting for you!", "You've got this Brooke!"],
  },
];

function DemoCard({ item }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: item.avatarColor }]}>
          <Text style={styles.avatarText}>{item.initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardHandle}>@{item.handle}</Text>
        </View>
      </View>
      <View style={[styles.habitTag, { backgroundColor: `${item.habitColor}18`, borderColor: item.habitColor }]}>
        <Text style={[styles.habitTagText, { color: item.habitColor }]}>Day {item.day} · {item.habitName}</Text>
      </View>
      <Text style={styles.cardContent}>{item.content}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.footerStat}>♥ {item.likes}</Text>
        <Text style={styles.footerStat}>○ {item.comments.length}</Text>
      </View>
      <View style={styles.commentsWrap}>
        {item.comments.slice(0, 2).map((c, i) => (
          <View key={i} style={styles.comment}>
            <View style={[styles.commentDot, { backgroundColor: item.avatarColor }]} />
            <Text style={styles.commentText}>{c}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function OnboardingHook({ navigation, onSkipToLogin }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const scrollAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const TOTAL = DEMO_FEED.length * 250;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scrollAnim, {
          toValue: TOTAL,
          duration: 28000,
          useNativeDriver: false,
        }),
        Animated.timing(scrollAnim, { toValue: 0, duration: 0, useNativeDriver: false }),
        Animated.delay(400),
      ])
    );
    animation.start();

    const listenerId = scrollAnim.addListener(({ value }) => {
      scrollRef.current?.scrollTo({ y: value, animated: false });
    });

    return () => {
      animation.stop();
      scrollAnim.removeListener(listenerId);
    };
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Live demo feed */}
      <View style={styles.feedWrap}>
        <ScrollView
          ref={scrollRef}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 60 }}
        >
          {DEMO_FEED.map(item => <DemoCard key={item.id} item={item} />)}
        </ScrollView>

        {/* Fade overlay — simulates gradient without expo-linear-gradient */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {[0.08, 0.2, 0.38, 0.58, 0.8, 1].map((opacity, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 16 + i * 22,
                backgroundColor: colors.bg,
                opacity,
              }}
            />
          ))}
        </View>
      </View>

      {/* Bottom CTA */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.tagline}>Your people are already showing up.</Text>
        <TouchableOpacity
          style={styles.cta}
          onPress={() => navigation.navigate('Declaration')}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>Join Them</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSkipToLogin} activeOpacity={0.7}>
          <Text style={styles.signinLink}>Already have an account? <Text style={{ color: colors.accent }}>Sign in</Text></Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(colors) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  feedWrap: { flex: 1, overflow: 'hidden' },
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: 8,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: 8 },
  avatar: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: 'white', fontSize: 13, fontWeight: '700' },
  cardName: { fontSize: 14, fontWeight: '700', color: colors.text },
  cardHandle: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  habitTag: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: radius.pill, borderWidth: 1, marginBottom: 8,
  },
  habitTagText: { fontSize: 11, fontWeight: '600' },
  cardContent: { fontSize: 14, color: colors.text, lineHeight: 20, marginBottom: 10 },
  cardFooter: { flexDirection: 'row', gap: 16, marginBottom: 6 },
  footerStat: { fontSize: 13, color: colors.textMuted },
  commentsWrap: { gap: 3 },
  comment: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  commentDot: { width: 5, height: 5, borderRadius: 3, flexShrink: 0 },
  commentText: { fontSize: 12, color: colors.textMuted, flex: 1 },
  bottom: {
    paddingHorizontal: spacing.xxl,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bg,
    alignItems: 'center',
    gap: 14,
  },
  tagline: { fontSize: 19, fontWeight: '700', color: colors.text, textAlign: 'center', lineHeight: 26 },
  cta: {
    backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingVertical: 16, width: '100%', alignItems: 'center',
  },
  ctaText: { color: 'white', fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
  signinLink: { fontSize: 13, color: colors.textMuted },
}); }
