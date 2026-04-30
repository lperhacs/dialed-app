/**
 * Settings Screen
 * Accessible from: gear icon on own Profile header + Settings tab in tab bar.
 *
 * Sections:
 *  1. Edit Profile       - name, username, bio, avatar (expo-image-picker)
 *  2. Location           - city-level text input (Google Places can be wired later)
 *  3. Notifications      - per-type toggles + nudge time
 *  4. Privacy            - default habit visibility
 *  5. Connected Accounts - Facebook placeholder + Phone OTP
 *  6. Calendar Default   - 7d / 30d / 90d / 180d / 1yr
 *  7. Appearance         - dark / light mode
 *  8. Account            - change email, change password, deactivate, delete
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Switch, Alert, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { usePro } from '../context/ProContext';
import Avatar from '../components/Avatar';
import { radius, spacing } from '../theme';

const CAL_OPTIONS = [7, 30, 90, 180, 365];
const CAL_LABELS  = { 7: '7d', 30: '30d', 90: '90d', 180: '180d', 365: '1yr' };
const CAL_DEFAULT_KEY = 'dialed_calendar_default';

// ── Reusable layout pieces ────────────────────────────────────────────────────

function SectionHeader({ title }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function SettingsRow({ label, detail, onPress, danger, rightElement, last }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const inner = (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={[styles.rowLabel, danger && { color: colors.red }]}>{label}</Text>
      <View style={styles.rowRight}>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
        {rightElement}
        {onPress && !rightElement && <Text style={styles.chevron}>›</Text>}
      </View>
    </View>
  );
  if (!onPress) return inner;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      {inner}
    </TouchableOpacity>
  );
}

// ── Edit Profile Modal ────────────────────────────────────────────────────────

function EditProfileModal({ visible, onClose, user, onSaved }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [form, setForm] = useState({ display_name: '', username: '', bio: '' });
  const [saving, setSaving] = useState(false);
  const [avatarUri, setAvatarUri] = useState(null);

  useEffect(() => {
    if (visible && user) {
      setForm({ display_name: user.display_name || '', username: user.username || '', bio: user.bio || '' });
      setAvatarUri(null);
    }
  }, [visible, user]);

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo library access to change your avatar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setAvatarUri(result.assets[0].uri);
  };

  const save = async () => {
    if (!form.display_name.trim()) { Alert.alert('Name required'); return; }
    if (form.bio.length > 160) { Alert.alert('Bio too long', 'Max 160 characters.'); return; }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('display_name', form.display_name.trim());
      formData.append('username', form.username.trim().toLowerCase());
      formData.append('bio', form.bio.trim());
      if (avatarUri) {
        formData.append('avatar', { uri: avatarUri, type: 'image/jpeg', name: 'avatar.jpg' });
      }
      const { data } = await api.put('/users/profile', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onSaved(data);
      onClose();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const initials = (user?.display_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}><Text style={{ color: colors.textMuted, fontSize: 15 }}>Cancel</Text></TouchableOpacity>
          <Text style={styles.modalTitle}>Edit Profile</Text>
          <TouchableOpacity onPress={save} disabled={saving}>
            {saving
              ? <ActivityIndicator color={colors.accent} size="small" />
              : <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '700' }}>Save</Text>}
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 18 }} keyboardShouldPersistTaps="handled">
          {/* Avatar */}
          <View style={styles.avatarEditWrap}>
            {avatarUri ? (
              <View style={[styles.avatarPreview, { backgroundColor: colors.bgHover }]}>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>Preview</Text>
              </View>
            ) : (
              <Avatar user={user} size="xl" />
            )}
            <TouchableOpacity style={styles.avatarEditBtn} onPress={pickAvatar} activeOpacity={0.8}>
              <Text style={styles.avatarEditBtnText}>{avatarUri ? 'Change Photo' : 'Change Avatar'}</Text>
            </TouchableOpacity>
          </View>

          {[
            { field: 'display_name', label: 'NAME', placeholder: 'Alex Rivera', auto: 'words' },
            { field: 'username', label: 'USERNAME', placeholder: 'alex_rn' },
          ].map(({ field, label, placeholder, auto }) => (
            <View key={field} style={styles.field}>
              <Text style={styles.fieldLabel}>{label}</Text>
              <TextInput
                style={styles.input}
                value={form[field]}
                onChangeText={v => setForm(f => ({ ...f, [field]: v }))}
                placeholder={placeholder}
                placeholderTextColor={colors.textDim}
                autoCapitalize={auto || 'none'}
                autoCorrect={false}
              />
            </View>
          ))}

          <View style={styles.field}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.fieldLabel}>BIO</Text>
              <Text style={[styles.fieldLabel, { color: form.bio.length > 140 ? colors.red : colors.textDim }]}>
                {form.bio.length}/160
              </Text>
            </View>
            <TextInput
              style={[styles.input, { minHeight: 72 }]}
              value={form.bio}
              onChangeText={v => setForm(f => ({ ...f, bio: v }))}
              placeholder="Tell people what you're about"
              placeholderTextColor={colors.textDim}
              multiline
              maxLength={160}
              textAlignVertical="top"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Change Password Modal ─────────────────────────────────────────────────────

function ChangePasswordModal({ visible, onClose }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.current || !form.next || !form.confirm) { Alert.alert('Fill in all fields'); return; }
    if (form.next !== form.confirm) { Alert.alert('Passwords don\'t match'); return; }
    if (form.next.length < 6) { Alert.alert('Too short', 'Password must be at least 6 characters.'); return; }
    setSaving(true);
    try {
      await api.patch('/users/me/password', { current_password: form.current, new_password: form.next });
      Alert.alert('Password changed', 'Your password has been updated.');
      onClose();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}><Text style={{ color: colors.textMuted, fontSize: 15 }}>Cancel</Text></TouchableOpacity>
          <Text style={styles.modalTitle}>Change Password</Text>
          <TouchableOpacity onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.accent} size="small" /> : <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '700' }}>Save</Text>}
          </TouchableOpacity>
        </View>
        <View style={{ padding: spacing.lg, gap: 14 }}>
          {[
            { field: 'current', label: 'CURRENT PASSWORD' },
            { field: 'next', label: 'NEW PASSWORD' },
            { field: 'confirm', label: 'CONFIRM NEW PASSWORD' },
          ].map(({ field, label }) => (
            <View key={field} style={styles.field}>
              <Text style={styles.fieldLabel}>{label}</Text>
              <TextInput
                style={styles.input}
                value={form[field]}
                onChangeText={v => setForm(f => ({ ...f, [field]: v }))}
                placeholder="••••••••"
                placeholderTextColor={colors.textDim}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

// ── Change Email Modal ────────────────────────────────────────────────────────

function ChangeEmailModal({ visible, onClose, currentEmail }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!email || !password) { Alert.alert('Fill in all fields'); return; }
    setSaving(true);
    try {
      await api.patch('/users/me/email', { email: email.toLowerCase(), password });
      Alert.alert('Email updated', 'Your email address has been changed.');
      onClose();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not update email.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}><Text style={{ color: colors.textMuted, fontSize: 15 }}>Cancel</Text></TouchableOpacity>
          <Text style={styles.modalTitle}>Change Email</Text>
          <TouchableOpacity onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.accent} size="small" /> : <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '700' }}>Save</Text>}
          </TouchableOpacity>
        </View>
        <View style={{ padding: spacing.lg, gap: 14 }}>
          <Text style={styles.rowDetail}>Current: {currentEmail}</Text>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>NEW EMAIL</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="new@example.com" placeholderTextColor={colors.textDim} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>CONFIRM WITH PASSWORD</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Your current password" placeholderTextColor={colors.textDim} secureTextEntry autoCapitalize="none" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Main Settings Screen ──────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user, logout, refresh } = useAuth();
  const { colors, themeMode, setThemeMode, isDark } = useTheme();
  const { isPro, streakFreezes, proExpiresAt } = usePro();
  const styles = makeStyles(colors);

  // Prefs
  const [location, setLocation] = useState(user?.location || '');
  const [locationSaving, setLocationSaving] = useState(false);

  const [notifyPrefs, setNotifyPrefs] = useState({
    follows: true,
    cheers: true,
    comments: true,
    messages: true,
    buddy: true,
    streaks: true,
  });
  const [nudgeTime, setNudgeTime] = useState('08:00');

  const [defaultVisibility, setDefaultVisibility] = useState('public');
  const [rsvpPrivate, setRsvpPrivate] = useState(false);
  const [buddyVisibility, setBuddyVisibility] = useState('public');
  const [calDefault, setCalDefault] = useState(7);

  // Modals
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Load stored preferences
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(CAL_DEFAULT_KEY),
      AsyncStorage.getItem('dialed_notify_prefs'),
      AsyncStorage.getItem('dialed_default_visibility'),
    ]).then(([cal, notifyStr, vis]) => {
      if (cal) setCalDefault(Number(cal));
      if (notifyStr) {
        const p = JSON.parse(notifyStr);
        setNotifyPrefs(prev => ({ ...prev, ...p }));
        if (p.nudgeTime) setNudgeTime(p.nudgeTime);
      }
      if (vis) setDefaultVisibility(vis);
    });
    if (user?.location) setLocation(user.location);
    if (user?.rsvp_private !== undefined) setRsvpPrivate(!!user.rsvp_private);
    if (user?.buddy_visibility) setBuddyVisibility(user.buddy_visibility);
  }, [user]);

  const saveNotifyPrefs = async (patch) => {
    const updated = { ...notifyPrefs, nudgeTime, ...patch };
    setNotifyPrefs(prev => ({ ...prev, ...patch }));
    await AsyncStorage.setItem('dialed_notify_prefs', JSON.stringify(updated));
    api.patch('/users/me/notifications', updated).catch(() => {});
  };

  const toggleNotify = (key, value) => {
    saveNotifyPrefs({ [key]: value });
  };

  const saveLocation = async () => {
    setLocationSaving(true);
    try {
      await api.patch('/users/me/location', { location: location.trim() });
      Alert.alert('Saved', 'Your location has been updated.');
    } catch {
      Alert.alert('Error', 'Could not save location.');
    } finally {
      setLocationSaving(false);
    }
  };

  const saveDefaultVisibility = async (v) => {
    setDefaultVisibility(v);
    await AsyncStorage.setItem('dialed_default_visibility', v);
    api.patch('/users/me/privacy', { default_habit_visibility: v }).catch(() => {});
  };

  const saveRsvpPrivate = (v) => {
    setRsvpPrivate(v);
    api.patch('/users/me/privacy', { rsvp_private: v }).catch(() => {});
  };

  const saveBuddyVisibility = (v) => {
    setBuddyVisibility(v);
    api.put('/users/profile', { buddy_visibility: v }).catch(() => {});
  };

  const setCalDefaultAndSave = async (d) => {
    setCalDefault(d);
    await AsyncStorage.setItem(CAL_DEFAULT_KEY, String(d));
  };

  const selectTheme = (mode) => {
    setThemeMode(mode);
  };

  const effectiveThemeLabel = themeMode === 'system'
    ? `System (${isDark ? 'Dark' : 'Light'})`
    : themeMode === 'dark' ? 'Dark' : 'Light';

  const handleDeactivate = () => {
    Alert.alert(
      'Deactivate Account',
      'Your profile and posts will be hidden until you log back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post('/users/me/deactivate');
              logout();
            } catch {
              Alert.alert('Error', 'Could not deactivate account.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = async () => {
    if (deleteText !== 'DELETE') {
      Alert.alert('Type DELETE to confirm');
      return;
    }
    setDeleteLoading(true);
    try {
      await api.delete('/users/me');
      logout();
    } catch {
      Alert.alert('Error', 'Could not delete account.');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

        {/* ─── Dialed Pro ───────────────────────────────────────────────── */}
        <SectionHeader title="Subscription" />
        <View style={styles.section}>
          {isPro ? (
            <>
              <View style={[styles.row, { gap: 12 }]}>
                <View style={styles.proBadge}>
                  <Text style={styles.proBadgeText}>Pro</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>Dialed Pro</Text>
                  {proExpiresAt && (
                    <Text style={[styles.rowDetail, { fontSize: 12 }]}>
                      Renews {new Date(proExpiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  )}
                </View>
              </View>
              <SettingsRow
                label="Streak freezes"
                detail={`${streakFreezes} remaining`}
                last
              />
            </>
          ) : (
            <SettingsRow
              label="Upgrade to Dialed Pro"
              detail="Unlimited habits, streak freezes & more"
              onPress={() => navigation.navigate('Paywall', { source: 'settings' })}
              last
            />
          )}
        </View>

        {/* ─── Edit Profile ──────────────────────────────────────────────── */}
        <SectionHeader title="Profile" />
        <View style={styles.section}>
          <SettingsRow
            label="Edit Profile"
            detail={user?.display_name}
            onPress={() => setShowEditProfile(true)}
          />
        </View>

        {/* ─── Location ─────────────────────────────────────────────────── */}
        <SectionHeader title="Location" />
        <View style={styles.section}>
          <View style={[styles.row, styles.rowLast]}>
            <TextInput
              style={styles.locationInput}
              value={location}
              onChangeText={setLocation}
              placeholder="City, State (e.g. Austin, TX)"
              placeholderTextColor={colors.textDim}
              returnKeyType="done"
              onSubmitEditing={saveLocation}
            />
            <TouchableOpacity
              style={[styles.saveLocationBtn, locationSaving && { opacity: 0.6 }]}
              onPress={saveLocation}
              disabled={locationSaving}
              activeOpacity={0.8}
            >
              {locationSaving
                ? <ActivityIndicator color="white" size="small" />
                : <Text style={styles.saveLocationBtnText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── Notifications ────────────────────────────────────────────── */}
        <SectionHeader title="Notifications" />
        <View style={styles.section}>
          {[
            { key: 'follows',   label: 'New followers' },
            { key: 'cheers',    label: 'Cheers on your posts' },
            { key: 'comments',  label: 'Comments on your posts' },
            { key: 'messages',  label: 'Direct messages' },
            { key: 'buddy',     label: 'Buddy requests' },
            { key: 'streaks',   label: 'Streak reminders' },
          ].map(({ key, label }) => (
            <SettingsRow
              key={key}
              label={label}
              rightElement={
                <Switch
                  value={notifyPrefs[key] !== false}
                  onValueChange={v => toggleNotify(key, v)}
                  thumbColor={notifyPrefs[key] !== false ? colors.accent : colors.border}
                  trackColor={{ true: colors.accentDim, false: colors.bgHover }}
                />
              }
            />
          ))}
          {notifyPrefs.streaks !== false && (
            <View style={[styles.row, styles.rowLast]}>
              <Text style={styles.rowLabel}>Reminder time</Text>
              <TextInput
                style={styles.timeInput}
                value={nudgeTime}
                onChangeText={t => { setNudgeTime(t); saveNotifyPrefs({ nudgeTime: t }); }}
                placeholder="08:00"
                placeholderTextColor={colors.textDim}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>
          )}
        </View>

        {/* ─── Privacy ──────────────────────────────────────────────────── */}
        <SectionHeader title="Privacy" />
        <View style={styles.section}>
          <SettingsRow
            label="Private RSVP"
            rightElement={
              <Switch
                value={rsvpPrivate}
                onValueChange={saveRsvpPrivate}
                thumbColor={rsvpPrivate ? colors.accent : colors.border}
                trackColor={{ true: colors.accentDim, false: colors.bgHover }}
              />
            }
          />
          <View style={[styles.row, { flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
            <Text style={styles.rowLabel}>Buddy visibility</Text>
            <Text style={[styles.rowDetail, { fontSize: 12 }]}>Who can see your buddy on your profile</Text>
            <View style={styles.segmentRow}>
              {[['public', 'Everyone'], ['private', 'Only you & buddy']].map(([v, label]) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.segment, buddyVisibility === v && styles.segmentActive]}
                  onPress={() => saveBuddyVisibility(v)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.segmentText, buddyVisibility === v && styles.segmentTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={[styles.row, styles.rowLast, { flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
            <Text style={styles.rowLabel}>Default habit visibility</Text>
            <View style={styles.segmentRow}>
              {['public', 'friends', 'private'].map(v => (
                <TouchableOpacity
                  key={v}
                  style={[styles.segment, defaultVisibility === v && styles.segmentActive]}
                  onPress={() => saveDefaultVisibility(v)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.segmentText, defaultVisibility === v && styles.segmentTextActive]}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* ─── Calendar Default ─────────────────────────────────────────── */}
        <SectionHeader title="Habit Calendar" />
        <View style={styles.section}>
          <View style={[styles.row, styles.rowLast, { flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
            <Text style={styles.rowLabel}>Default view</Text>
            <View style={styles.segmentRow}>
              {CAL_OPTIONS.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.segment, calDefault === d && styles.segmentActive]}
                  onPress={() => setCalDefaultAndSave(d)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.segmentText, calDefault === d && styles.segmentTextActive]}>
                    {CAL_LABELS[d]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* ─── Connected Accounts ───────────────────────────────────────── */}
        <SectionHeader title="Connected Accounts" />
        <View style={styles.section}>
          <SettingsRow
            label="Facebook"
            detail="Not connected"
            onPress={() => Alert.alert('Coming soon', 'Facebook connect will be available in the next update.')}
          />
          <SettingsRow
            label="Phone number"
            detail={user?.phone ? 'Verified' : 'Not set'}
            onPress={() => Alert.alert('Phone verification', 'Phone verification is handled during onboarding or from your profile.')}
            last
          />
        </View>

        {/* ─── Appearance ───────────────────────────────────────────────── */}
        <SectionHeader title="Appearance" />
        <View style={styles.section}>
          <View style={[styles.row, styles.rowLast, { flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
            <Text style={styles.rowLabel}>Theme</Text>
            <View style={styles.segmentRow}>
              {[
                { value: 'light',  label: 'Light'  },
                { value: 'system', label: 'System' },
                { value: 'dark',   label: 'Dark'   },
              ].map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.segment, themeMode === opt.value && styles.segmentActive]}
                  onPress={() => selectTheme(opt.value)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.segmentText, themeMode === opt.value && styles.segmentTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {themeMode === 'system' && (
              <Text style={styles.themeHint}>Following device - currently {isDark ? 'Dark' : 'Light'}</Text>
            )}
          </View>
        </View>

        {/* ─── Account ──────────────────────────────────────────────────── */}
        <SectionHeader title="Account" />
        <View style={styles.section}>
          <SettingsRow label="Change email" detail={user?.email} onPress={() => setShowChangeEmail(true)} />
          <SettingsRow label="Change password" onPress={() => setShowChangePassword(true)} />
          <SettingsRow label="Log out" danger onPress={() => {
            Alert.alert('Log out?', '', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Log out', style: 'destructive', onPress: logout },
            ]);
          }} />
          <SettingsRow label="Deactivate account" danger onPress={handleDeactivate} />
          <SettingsRow label="Delete account" danger onPress={() => setShowDeleteConfirm(true)} last />
        </View>

        {/* ─── Delete confirmation inline ───────────────────────────────── */}
        {showDeleteConfirm && (
          <View style={styles.deleteBox}>
            <Text style={styles.deleteWarning}>
              This is permanent. All your posts, habits, streaks, and data will be gone forever.
            </Text>
            <Text style={styles.deleteInstructions}>Type DELETE to confirm:</Text>
            <TextInput
              style={[styles.input, { color: colors.red, borderColor: colors.red, marginBottom: 10 }]}
              value={deleteText}
              onChangeText={setDeleteText}
              placeholder="DELETE"
              placeholderTextColor={colors.textDim}
              autoCapitalize="characters"
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={styles.deleteCancelBtn}
                onPress={() => { setShowDeleteConfirm(false); setDeleteText(''); }}
              >
                <Text style={{ color: colors.textMuted, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteConfirmBtn, (deleteText !== 'DELETE' || deleteLoading) && { opacity: 0.5 }]}
                onPress={handleDeleteAccount}
                disabled={deleteText !== 'DELETE' || deleteLoading}
              >
                {deleteLoading
                  ? <ActivityIndicator color="white" size="small" />
                  : <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Delete my account</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ─── Legal ────────────────────────────────────────────────────── */}
        <SectionHeader title="Legal" />
        <View style={styles.section}>
          <SettingsRow label="Terms of Service" onPress={() => navigation.navigate('Legal', { doc: 'terms' })} />
          <SettingsRow label="Privacy Policy" onPress={() => navigation.navigate('Legal', { doc: 'privacy' })} last />
        </View>

        <Text style={styles.versionText}>Dialed · v1.0.0</Text>
      </ScrollView>

      {/* ─── Modals ───────────────────────────────────────────────────────── */}
      <EditProfileModal
        visible={showEditProfile}
        onClose={() => setShowEditProfile(false)}
        user={user}
        onSaved={() => refresh()}
      />
      <ChangePasswordModal
        visible={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />
      <ChangeEmailModal
        visible={showChangeEmail}
        onClose={() => setShowChangeEmail(false)}
        currentEmail={user?.email}
      />
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      paddingHorizontal: spacing.lg, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
    },
    headerTitle: { fontSize: 20, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
    sectionHeader: {
      fontSize: 11, fontWeight: '500', color: colors.textDim,
      paddingHorizontal: spacing.lg, paddingTop: 24, paddingBottom: 6,
    },
    section: {
      backgroundColor: colors.bgCard,
      marginHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: spacing.lg, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
    },
    rowLast: { borderBottomWidth: 0 },
    rowLabel: { flex: 1, fontSize: 15, color: colors.text },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowDetail: { fontSize: 14, color: colors.textMuted },
    chevron: { fontSize: 20, color: colors.textDim, marginLeft: 4 },
    // Location
    locationInput: {
      flex: 1, color: colors.text, fontSize: 15,
      paddingVertical: 0,
    },
    saveLocationBtn: {
      backgroundColor: colors.accent, borderRadius: radius.sm,
      paddingHorizontal: 12, paddingVertical: 6,
    },
    saveLocationBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
    // Segments
    segmentRow: { flexDirection: 'row', gap: 6 },
    segment: {
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.sm,
      borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: 'transparent',
    },
    segmentActive: { backgroundColor: colors.accentDim, borderColor: colors.accent },
    segmentText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
    segmentTextActive: { color: colors.accent },
    // Time input
    timeInput: {
      backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.sm, color: colors.text, fontSize: 15,
      paddingHorizontal: 10, paddingVertical: 6, textAlign: 'center', width: 70,
    },
    // Delete
    deleteBox: {
      marginHorizontal: spacing.lg, marginTop: 16,
      backgroundColor: colors.redDim, borderWidth: 1, borderColor: colors.red,
      borderRadius: radius.md, padding: spacing.lg,
    },
    deleteWarning: { fontSize: 13, color: colors.text, lineHeight: 19, marginBottom: 12 },
    deleteInstructions: { fontSize: 12, fontWeight: '500', color: colors.textMuted, marginBottom: 8 },
    deleteCancelBtn: {
      flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
      paddingVertical: 11, alignItems: 'center',
    },
    deleteConfirmBtn: {
      flex: 2, backgroundColor: colors.red, borderRadius: radius.sm,
      paddingVertical: 11, alignItems: 'center',
    },
    // Modal
    modalContainer: { flex: 1, backgroundColor: colors.bg },
    modalHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    field: { gap: 6 },
    fieldLabel: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
    input: {
      backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.sm, color: colors.text, fontSize: 15,
      paddingHorizontal: 14, paddingVertical: 12,
    },
    avatarEditWrap: { alignItems: 'center', gap: 12, paddingVertical: 8 },
    avatarPreview: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
    avatarEditBtn: {
      borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
      paddingHorizontal: 16, paddingVertical: 7,
    },
    avatarEditBtnText: { fontSize: 14, fontWeight: '600', color: colors.text },
    themeHint: { fontSize: 12, color: colors.textDim },
    versionText: { textAlign: 'center', fontSize: 12, color: colors.textDim, marginTop: 32, marginBottom: 8 },
    proBadge: {
      backgroundColor: colors.accent, borderRadius: radius.xs,
      paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
    },
    proBadgeText: { fontSize: 11, fontWeight: '700', color: colors.bg },
  });
}
