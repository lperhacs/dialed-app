import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Share, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

const APP_STORE_URL = 'https://apps.apple.com/app/dialed/id6762577687';

export default function OnboardingInvite({ navigation, route }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { habitName, displayName } = route.params ?? {};
  const [shared, setShared] = useState(false);

  const name = user?.display_name || displayName || 'Someone';

  const handleInvite = async () => {
    try {
      const result = await Share.share({
        message: `Hey! I just started using Dialed to build better habits and I want you as my accountability buddy. Download it here: ${APP_STORE_URL}`,
        title: `${name} invited you to Dialed`,
      });
      if (result.action === Share.sharedAction) {
        setShared(true);
      }
    } catch {
      Alert.alert('Could not open share sheet');
    }
  };

  const proceed = () => {
    navigation.navigate('Welcome', { habitName, displayName });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TouchableOpacity style={styles.skipBtn} onPress={proceed} activeOpacity={0.7}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconWrap}>
          <Ionicons name="people" size={32} color={colors.accent} />
        </View>

        <Text style={styles.headline}>
          This app works better{'\n'}with a buddy
        </Text>
        <Text style={styles.sub}>
          An accountability buddy sees your habits daily and you see theirs. The data is clear — people with a buddy are 3x more likely to hit their streaks.
        </Text>

        {/* What a buddy does */}
        <View style={styles.benefitList}>
          {[
            { icon: 'eye-outline',       text: 'They see when you log — and when you don\'t' },
            { icon: 'flash-outline',     text: 'You see each other\'s streaks in real time' },
            { icon: 'shield-checkmark-outline', text: 'Cover each other\'s streaks with freezes on Pro' },
          ].map((b, i) => (
            <View key={i} style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <Ionicons name={b.icon} size={16} color={colors.accent} />
              </View>
              <Text style={styles.benefitText}>{b.text}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* CTAs */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        {shared ? (
          <View style={styles.sharedRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
            <Text style={styles.sharedText}>Invite sent — nice.</Text>
          </View>
        ) : null}
        <TouchableOpacity style={styles.inviteBtn} onPress={handleInvite} activeOpacity={0.85}>
          <Ionicons name="share-outline" size={18} color={colors.bg} />
          <Text style={styles.inviteBtnText}>
            {shared ? 'Invite another friend' : 'Invite a friend'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={proceed} activeOpacity={0.7} style={styles.skipLink}>
          <Text style={styles.skipLinkText}>
            {shared ? 'Continue →' : 'I\'ll find a buddy later'}
          </Text>
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

    content: {
      flex: 1, justifyContent: 'center',
      paddingHorizontal: spacing.xxl, gap: 20,
    },
    iconWrap: {
      width: 64, height: 64, borderRadius: radius.md,
      backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentDimBorder,
      justifyContent: 'center', alignItems: 'center', marginBottom: 4,
    },
    headline: {
      fontSize: 28, fontWeight: '800', color: colors.text,
      lineHeight: 34, letterSpacing: -0.5,
    },
    sub: {
      fontSize: 15, color: colors.textMuted,
      lineHeight: 22,
    },
    benefitList: { gap: 12, marginTop: 4 },
    benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    benefitIcon: {
      width: 32, height: 32, borderRadius: radius.sm,
      backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentDimBorder,
      justifyContent: 'center', alignItems: 'center', marginTop: 1,
    },
    benefitText: { flex: 1, fontSize: 14, color: colors.textMuted, lineHeight: 20, paddingTop: 6 },

    bottom: {
      paddingHorizontal: spacing.xxl, paddingTop: 20,
      borderTopWidth: 1, borderTopColor: colors.borderSubtle,
      gap: 12, alignItems: 'center',
    },
    sharedRow: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
    },
    sharedText: { fontSize: 14, color: colors.accent, fontWeight: '600' },
    inviteBtn: {
      backgroundColor: colors.accent, borderRadius: radius.pill,
      paddingVertical: 16, width: '100%',
      flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    },
    inviteBtnText: { color: colors.bg, fontSize: 16, fontWeight: '800' },
    skipLink: { paddingVertical: 4 },
    skipLinkText: { fontSize: 14, color: colors.textMuted },
  });
}
