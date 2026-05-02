import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Dimensions, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    key: 'buddies',
    icon: 'people',
    color: '#34d399',
    headline: 'Your accountability\npartner',
    sub: 'A buddy sees your habits every day — and you see theirs. Real stakes, real results.',
    bullets: [
      { icon: 'eye-outline',            text: 'They see when you log — and when you don\'t' },
      { icon: 'notifications-outline',  text: 'Get nudged at 5pm if your buddy hasn\'t logged' },
      { icon: 'shield-checkmark-outline', text: 'Cover each other\'s streaks with freezes on Pro' },
    ],
  },
  {
    key: 'groups',
    icon: 'shield',
    color: '#8b5cf6',
    headline: 'Join a group\nchallenge',
    sub: 'Challenges bring people together around a shared habit. A great way to find your crowd.',
    bullets: [
      { icon: 'people-outline',       text: 'Log your habit alongside everyone in the group' },
      { icon: 'trophy-outline',       text: 'Leaderboard tracks who\'s showing up most' },
      { icon: 'chatbubbles-outline',  text: 'Group chat to keep each other fired up' },
    ],
  },
  {
    key: 'events',
    icon: 'calendar',
    color: '#3b82f6',
    headline: 'Show up\nin real life',
    sub: 'Events let you take your habits offline — group runs, meetups, workout sessions.',
    bullets: [
      { icon: 'location-outline',   text: 'Find events near you or create your own' },
      { icon: 'person-add-outline', text: 'RSVP and see who else is coming' },
      { icon: 'flash-outline',      text: 'Log your habit right from the event page' },
    ],
  },
];

function Slide({ slide, colors, styles }) {
  return (
    <View style={[styles.slide, { width }]}>
      <View style={[styles.iconWrap, { backgroundColor: `${slide.color}18`, borderColor: `${slide.color}40` }]}>
        <Ionicons name={slide.icon} size={36} color={slide.color} />
      </View>
      <Text style={styles.headline}>{slide.headline}</Text>
      <Text style={styles.sub}>{slide.sub}</Text>
      <View style={styles.bullets}>
        {slide.bullets.map((b, i) => (
          <View key={i} style={styles.bulletRow}>
            <View style={[styles.bulletIcon, { backgroundColor: `${slide.color}18`, borderColor: `${slide.color}30` }]}>
              <Ionicons name={b.icon} size={16} color={slide.color} />
            </View>
            <Text style={styles.bulletText}>{b.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function OnboardingFeatures({ navigation, route }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const dotAnim = useRef(SLIDES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;

  const { habitName, displayName } = route.params ?? {};

  const goTo = (index) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
  };

  const onScroll = (e) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    if (index !== activeIndex) {
      setActiveIndex(index);
      dotAnim.forEach((anim, i) => {
        Animated.timing(anim, {
          toValue: i === index ? 1 : 0,
          duration: 180,
          useNativeDriver: false,
        }).start();
      });
    }
  };

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      goTo(activeIndex + 1);
    } else {
      navigation.navigate('Invite', { habitName, displayName });
    }
  };

  const isLast = activeIndex === SLIDES.length - 1;
  const activeColor = SLIDES[activeIndex].color;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TouchableOpacity
        style={styles.skipBtn}
        onPress={() => navigation.navigate('Invite', { habitName, displayName })}
        activeOpacity={0.7}
      >
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: 'center' }}
      >
        {SLIDES.map(slide => (
          <Slide key={slide.key} slide={slide} colors={colors} styles={styles} />
        ))}
      </ScrollView>

      {/* Bottom */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        {/* Dot indicators */}
        <View style={styles.dots}>
          {SLIDES.map((slide, i) => {
            const dotWidth = dotAnim[i].interpolate({ inputRange: [0, 1], outputRange: [6, 20] });
            const dotColor = dotAnim[i].interpolate({ inputRange: [0, 1], outputRange: [colors.borderSubtle, slide.color] });
            return (
              <Animated.View
                key={i}
                style={[styles.dot, { width: dotWidth, backgroundColor: dotColor }]}
              />
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: activeColor }]}
          onPress={handleNext}
          activeOpacity={0.85}
        >
          <Text style={styles.nextBtnText}>{isLast ? 'Find a buddy →' : 'Next →'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    skipBtn: { position: 'absolute', top: 56, right: spacing.lg, zIndex: 10 },
    skipText: { fontSize: 14, color: colors.textMuted },

    slide: {
      paddingHorizontal: spacing.xxl,
      paddingTop: 40,
      gap: 20,
      alignItems: 'flex-start',
    },
    iconWrap: {
      width: 72, height: 72, borderRadius: radius.md,
      borderWidth: 1,
      justifyContent: 'center', alignItems: 'center',
      marginBottom: 4,
    },
    headline: {
      fontSize: 30, fontWeight: '800', color: colors.text,
      lineHeight: 36, letterSpacing: -0.5,
    },
    sub: {
      fontSize: 15, color: colors.textMuted, lineHeight: 22,
    },
    bullets: { gap: 14, width: '100%' },
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    bulletIcon: {
      width: 34, height: 34, borderRadius: radius.sm,
      borderWidth: 1,
      justifyContent: 'center', alignItems: 'center',
      marginTop: 1, flexShrink: 0,
    },
    bulletText: {
      flex: 1, fontSize: 14, color: colors.textMuted, lineHeight: 21, paddingTop: 6,
    },

    bottom: {
      paddingHorizontal: spacing.xxl,
      paddingTop: 20,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle,
      gap: 16,
      alignItems: 'center',
    },
    dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
    dot: { height: 6, borderRadius: 3 },
    nextBtn: {
      borderRadius: radius.sm,
      paddingVertical: 16, width: '100%', alignItems: 'center',
    },
    nextBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
  });
}
