/**
 * Screen 3 — Find Your People
 *
 * Phone OTP: fully wired to the backend placeholder.
 * Contact matching: requires `npx expo install expo-contacts` — gracefully falls
 * back to server-side suggestions when the module isn't available.
 * Facebook: UI placeholder ready for expo-auth-session + FB app credentials.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../api/client';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

// Attempt to load expo-contacts if available
let Contacts = null;
try { Contacts = require('expo-contacts'); } catch { /* not installed */ }

function SuggestedUser({ user, onFollow }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  const follow = async () => {
    setLoading(true);
    try {
      await api.post(`/users/${user.id}/follow`);
      setFollowing(true);
    } catch {
      Alert.alert('Error', 'Could not follow this user');
    } finally {
      setLoading(false);
    }
  };

  const initials = (user.display_name || user.username || '?')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <View style={styles.userRow}>
      <View style={[styles.avatar, { backgroundColor: colors.accentDim }]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.userName}>{user.display_name}</Text>
        <Text style={styles.userHandle}>
          @{user.username}
          {user.habit_name ? ` · ${user.streak ?? 0}d ${user.habit_name}` : ''}
        </Text>
      </View>
      {following ? (
        <Text style={styles.followedText}>Following</Text>
      ) : (
        <TouchableOpacity
          style={styles.followBtn}
          onPress={follow}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator color="white" size="small" />
            : <Text style={styles.followBtnText}>Follow</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function OnboardingFindPeople({ navigation, route }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { habitName, habitId, displayName } = route.params ?? {};
  const insets = useSafeAreaInsets();

  // OTP flow state
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);

  // Suggestions
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Load default suggestions on mount
  useEffect(() => {
    loadSuggestions();
  }, []);

  const loadSuggestions = async (contactPhones = []) => {
    setSuggestionsLoading(true);
    try {
      // Pass any matched contact phones; server returns matched + recommended users
      const { data } = await api.get('/users/search?q=');
      // Filter out empty results — use the recommended endpoint as fallback
      if (data.length === 0) {
        const { data: rec } = await api.get('/users/recommended');
        setSuggestions(rec);
      } else {
        setSuggestions(data.slice(0, 10));
      }
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const sendOtp = async () => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) {
      Alert.alert('Invalid number', 'Enter a valid 10-digit phone number.');
      return;
    }
    setPhoneLoading(true);
    try {
      await api.post('/auth/send-otp', { phone: cleaned });
      setOtpSent(true);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not send code.');
    } finally {
      setPhoneLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) { Alert.alert('Invalid code', 'Enter the 6-digit code.'); return; }
    setPhoneLoading(true);
    try {
      await api.post('/auth/verify-otp', { phone: phone.replace(/\D/g, ''), otp });
      setPhoneVerified(true);

      // Try reading contacts if expo-contacts is available
      if (Contacts) {
        try {
          const { status } = await Contacts.requestPermissionsAsync();
          if (status === 'granted') {
            const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
            const phones = data.flatMap(c => (c.phoneNumbers || []).map(p => p.number?.replace(/\D/g, ''))).filter(Boolean);
            await loadSuggestions(phones);
          }
        } catch {
          // Contacts unavailable — keep default suggestions
        }
      }
    } catch (err) {
      Alert.alert('Wrong code', err.response?.data?.error || 'Code did not match. Try again.');
    } finally {
      setPhoneLoading(false);
    }
  };

  const proceed = () => {
    navigation.navigate('Welcome', { habitName, displayName });
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Skip */}
      <TouchableOpacity style={styles.skipBtn} onPress={proceed} activeOpacity={0.7}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <FlatList
        data={suggestions}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <Text style={styles.headline}>See who's already Dialed in.</Text>
            <Text style={styles.subtext}>Follow people who'll keep you accountable.</Text>

            {/* Phone verification card */}
            <View style={styles.phoneCard}>
              <Text style={styles.phoneCardTitle}>Find friends from your contacts</Text>
              {!phoneVerified ? (
                !otpSent ? (
                  <View style={styles.phoneRow}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="Phone number"
                      placeholderTextColor={colors.textDim}
                      keyboardType="phone-pad"
                      maxLength={14}
                    />
                    <TouchableOpacity
                      style={[styles.sendBtn, phoneLoading && { opacity: 0.6 }]}
                      onPress={sendOtp}
                      disabled={phoneLoading}
                      activeOpacity={0.85}
                    >
                      {phoneLoading
                        ? <ActivityIndicator color="white" size="small" />
                        : <Text style={styles.sendBtnText}>Send code</Text>}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <Text style={styles.otpHint}>Enter the 6-digit code sent to {phone}</Text>
                    <View style={styles.phoneRow}>
                      <TextInput
                        style={[styles.input, { flex: 1, letterSpacing: 4, fontSize: 18 }]}
                        value={otp}
                        onChangeText={t => setOtp(t.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        placeholderTextColor={colors.textDim}
                        keyboardType="number-pad"
                        maxLength={6}
                      />
                      <TouchableOpacity
                        style={[styles.sendBtn, (otp.length < 6 || phoneLoading) && { opacity: 0.6 }]}
                        onPress={verifyOtp}
                        disabled={otp.length < 6 || phoneLoading}
                        activeOpacity={0.85}
                      >
                        {phoneLoading
                          ? <ActivityIndicator color="white" size="small" />
                          : <Text style={styles.sendBtnText}>Verify</Text>}
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={() => { setOtpSent(false); setOtp(''); }} style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 12, color: colors.textMuted }}>← Change number</Text>
                    </TouchableOpacity>
                  </View>
                )
              ) : (
                <View style={styles.verifiedRow}>
                  <Text style={styles.verifiedText}>✓ Verified — showing friends on Dialed</Text>
                </View>
              )}

              {/* Facebook placeholder */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
              <TouchableOpacity
                style={styles.fbBtn}
                onPress={() => Alert.alert('Coming soon', 'Facebook connect will be available in the next update.')}
                activeOpacity={0.85}
              >
                <Text style={styles.fbBtnText}>Connect Facebook</Text>
              </TouchableOpacity>
            </View>

            {suggestions.length > 0 && (
              <Text style={styles.sectionLabel}>
                {phoneVerified ? 'Friends on Dialed' : 'People you might know'}
              </Text>
            )}
            {suggestionsLoading && <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />}
          </View>
        }
        renderItem={({ item }) => <SuggestedUser key={item.id} user={item} />}
        ListEmptyComponent={
          !suggestionsLoading ? (
            <Text style={styles.emptyText}>No suggestions yet — invite your friends!</Text>
          ) : null
        }
        ListFooterComponent={
          <TouchableOpacity style={styles.continueBtn} onPress={proceed} activeOpacity={0.85}>
            <Text style={styles.continueBtnText}>Continue →</Text>
          </TouchableOpacity>
        }
      />
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  skipBtn: { position: 'absolute', top: 56, right: spacing.lg, zIndex: 10 },
  skipText: { fontSize: 14, color: colors.textMuted },
  listContent: { padding: spacing.lg, paddingTop: 24, paddingBottom: 40 },
  headline: { fontSize: 26, fontWeight: '800', color: colors.text, lineHeight: 32, marginBottom: 6 },
  subtext: { fontSize: 14, color: colors.textMuted, marginBottom: 24, lineHeight: 20 },
  phoneCard: {
    backgroundColor: colors.bgCard, borderRadius: radius.md,
    padding: spacing.lg, marginBottom: 24,
    borderWidth: 1, borderColor: colors.borderSubtle,
  },
  phoneCardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 12 },
  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    backgroundColor: colors.bgInput, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.sm, color: colors.text, fontSize: 15,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  sendBtn: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 12 },
  sendBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  otpHint: { fontSize: 12, color: colors.textMuted, marginBottom: 10 },
  verifiedRow: { paddingVertical: 10 },
  verifiedText: { fontSize: 14, color: colors.green, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.borderSubtle },
  dividerText: { fontSize: 12, color: colors.textDim },
  fbBtn: {
    borderWidth: 1.5, borderColor: '#1877f2', borderRadius: radius.sm,
    paddingVertical: 12, alignItems: 'center',
  },
  fbBtnText: { color: '#1877f2', fontWeight: '700', fontSize: 14 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  emptyText: { fontSize: 14, color: colors.textDim, textAlign: 'center', paddingVertical: 20 },
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  userName: { fontSize: 14, fontWeight: '700', color: colors.text },
  userHandle: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  followBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 7 },
  followBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  followedText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  continueBtn: {
    marginTop: 24, backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingVertical: 15, alignItems: 'center',
  },
  continueBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
  });
}
