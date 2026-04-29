import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { usePro } from '../context/ProContext';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { radius, spacing } from '../theme';

const FEATURES = [
  { icon: 'infinite-outline',      label: 'Unlimited habits',         sub: 'Free plan limited to 5' },
  { icon: 'snow-outline',          label: '3 streak freezes/month',   sub: 'Save a streak when life happens' },
  { icon: 'bar-chart-outline',     label: 'Full habit analytics',     sub: 'Trends, completion rates, insights' },
  { icon: 'people-outline',        label: 'Up to 3 accountability buddies', sub: 'Free plan limited to 1' },
];

export default function PaywallScreen({ route }) {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { refresh } = usePro();
  const styles = makeStyles(colors);

  const [selectedPlan, setSelectedPlan] = useState('annual');
  const [purchasing, setPurchasing] = useState(false);

  // Source that triggered the paywall (for analytics)
  const source = route?.params?.source || 'unknown';

  const handleSubscribe = async () => {
    /**
     * TODO: Replace with RevenueCat purchase flow when App Store Connect is ready:
     *
     *   import Purchases from 'react-native-purchases';
     *   const offerings = await Purchases.getOfferings();
     *   const pkg = offerings.current.availablePackages.find(p =>
     *     selectedPlan === 'annual' ? p.packageType === 'ANNUAL' : p.packageType === 'MONTHLY'
     *   );
     *   const { customerInfo } = await Purchases.purchasePackage(pkg);
     *   if (customerInfo.entitlements.active['pro']) { ... }
     *
     * RevenueCat webhook then calls POST /api/pro/grant with the server key.
     */

    // Dev / TestFlight: call grant directly
    if (!process.env.EXPO_PUBLIC_PRO_SERVER_KEY) {
      Alert.alert(
        'Coming soon',
        'In-app purchases will be available when Dialed Pro launches. Stay tuned!',
      );
      return;
    }

    setPurchasing(true);
    try {
      await api.post(
        '/pro/grant',
        { user_id: user.id, plan: selectedPlan },
        { headers: { Authorization: `Bearer ${process.env.EXPO_PUBLIC_PRO_SERVER_KEY}` } }
      );
      await refresh();
      Alert.alert('Welcome to Dialed Pro!', 'Your subscription is now active.', [
        { text: 'Let\'s go', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Purchase failed', err.response?.data?.error || 'Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn} hitSlop={12}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Badge */}
        <View style={styles.badge}>
          <View style={styles.badgeIcon}>
            <Ionicons name="flash" size={20} color={colors.accent} />
          </View>
          <Text style={styles.badgeText}>Dialed Pro</Text>
        </View>

        <Text style={styles.headline}>Build habits{'\n'}without limits</Text>
        <Text style={styles.sub}>
          Everything you need to stay consistent, stay accountable, and protect your streaks.
        </Text>

        {/* Feature list */}
        <View style={styles.featureList}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={f.icon} size={18} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureLabel}>{f.label}</Text>
                <Text style={styles.featureSub}>{f.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Plan selector */}
        <View style={styles.planRow}>
          <TouchableOpacity
            style={[styles.planCard, selectedPlan === 'annual' && styles.planCardActive]}
            onPress={() => setSelectedPlan('annual')}
            activeOpacity={0.85}
          >
            <View style={styles.bestValueBadge}>
              <Text style={styles.bestValueText}>Best Value</Text>
            </View>
            <Text style={[styles.planName, selectedPlan === 'annual' && { color: colors.accent }]}>
              Annual
            </Text>
            <Text style={[styles.planPrice, selectedPlan === 'annual' && { color: colors.text }]}>
              $29.99
            </Text>
            <Text style={styles.planPer}>per year</Text>
            <Text style={styles.planSavings}>$2.50/mo — save 37%</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.planCard, selectedPlan === 'monthly' && styles.planCardActive]}
            onPress={() => setSelectedPlan('monthly')}
            activeOpacity={0.85}
          >
            <Text style={[styles.planName, selectedPlan === 'monthly' && { color: colors.accent }]}>
              Monthly
            </Text>
            <Text style={[styles.planPrice, selectedPlan === 'monthly' && { color: colors.text }]}>
              $3.99
            </Text>
            <Text style={styles.planPer}>per month</Text>
          </TouchableOpacity>
        </View>

        {/* Subscribe button */}
        <TouchableOpacity
          style={[styles.subscribeBtn, purchasing && { opacity: 0.6 }]}
          onPress={handleSubscribe}
          disabled={purchasing}
          activeOpacity={0.85}
        >
          {purchasing
            ? <ActivityIndicator color={colors.bg} size="small" />
            : <Text style={styles.subscribeBtnText}>
                Subscribe {selectedPlan === 'annual' ? '· $29.99/yr' : '· $3.99/mo'}
              </Text>
          }
        </TouchableOpacity>

        <Text style={styles.legal}>
          Subscription auto-renews. Cancel anytime in your App Store settings.
        </Text>

        <TouchableOpacity onPress={() => Alert.alert('Restore Purchases', 'This will be available when the App Store is connected.')} style={styles.restoreBtn}>
          <Text style={styles.restoreText}>Restore purchases</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    header: {
      paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 4,
      alignItems: 'flex-end',
    },
    closeBtn: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: colors.bgHover, justifyContent: 'center', alignItems: 'center',
    },
    content: {
      paddingHorizontal: spacing.lg, paddingBottom: 40, alignItems: 'center',
    },

    badge: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentDimBorder,
      borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6,
      marginBottom: 24,
    },
    badgeIcon: {
      width: 24, height: 24, borderRadius: 12,
      backgroundColor: colors.bgHover, justifyContent: 'center', alignItems: 'center',
    },
    badgeText: { fontSize: 13, fontWeight: '600', color: colors.accent },

    headline: {
      fontSize: 32, fontWeight: '700', color: colors.text,
      textAlign: 'center', letterSpacing: -0.8, lineHeight: 38,
      marginBottom: 10,
    },
    sub: {
      fontSize: 15, color: colors.textMuted, textAlign: 'center',
      lineHeight: 22, marginBottom: 28, maxWidth: 300,
    },

    featureList: {
      width: '100%', gap: 12, marginBottom: 32,
    },
    featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
    featureIconWrap: {
      width: 36, height: 36, borderRadius: radius.sm,
      backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentDimBorder,
      justifyContent: 'center', alignItems: 'center', marginTop: 1,
    },
    featureLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 2 },
    featureSub: { fontSize: 12, color: colors.textMuted },

    planRow: { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 24 },
    planCard: {
      flex: 1, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.borderSubtle,
      backgroundColor: colors.bgCard, padding: 18, alignItems: 'center', position: 'relative',
    },
    planCardActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
    planName: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 8 },
    planPrice: { fontSize: 28, fontWeight: '700', color: colors.textMuted, letterSpacing: -0.5 },
    planPer: { fontSize: 11, color: colors.textDim, marginTop: 2 },
    planSavings: { fontSize: 11, color: colors.accent, fontWeight: '600', marginTop: 6 },
    bestValueBadge: {
      position: 'absolute', top: -10, alignSelf: 'center',
      backgroundColor: colors.accent, borderRadius: radius.xs,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    bestValueText: { fontSize: 10, fontWeight: '700', color: colors.bg },

    subscribeBtn: {
      width: '100%', backgroundColor: colors.accent,
      borderRadius: radius.sm, paddingVertical: 16, alignItems: 'center',
      marginBottom: 12,
    },
    subscribeBtnText: { fontSize: 16, fontWeight: '700', color: colors.bg },

    legal: {
      fontSize: 11, color: colors.textDim, textAlign: 'center',
      lineHeight: 16, marginBottom: 12, paddingHorizontal: 16,
    },
    restoreBtn: { paddingVertical: 8 },
    restoreText: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
  });
}
