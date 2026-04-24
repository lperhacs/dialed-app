import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

const HABIT_CHIPS = [
  { label: 'Work Out', color: '#ef4444' },
  { label: 'Read Daily', color: '#8b5cf6' },
  { label: 'Meditate', color: '#3b82f6' },
  { label: 'Drink More Water', color: '#22c55e' },
  { label: 'Learn Something New', color: '#fbbf24' },
  { label: 'Journal', color: '#34d399' },
  { label: 'Sleep Better', color: '#3b82f6' },
  { label: 'Eat Healthier', color: '#22c55e' },
];

const HABIT_COLORS = ['#34d399', '#ef4444', '#3b82f6', '#8b5cf6', '#22c55e', '#fbbf24'];

export default function OnboardingDeclaration({ navigation }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [step, setStep] = useState(1);
  const [selectedChips, setSelectedChips] = useState([]);
  const [customHabit, setCustomHabit] = useState('');
  const [loading, setLoading] = useState(false);

  // Account form
  const [form, setForm] = useState({ display_name: '', username: '', email: '', password: '' });
  const [emailError, setEmailError] = useState('');
  const set = field => value => setForm(f => ({ ...f, [field]: value }));

  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  const toggleChip = (chip) => {
    setSelectedChips(prev => {
      const exists = prev.some(c => c.label === chip.label);
      return exists ? prev.filter(c => c.label !== chip.label) : [...prev, chip];
    });
  };

  // All habits to create: selected chips + custom if filled
  const allHabits = [
    ...selectedChips,
    ...(customHabit.trim() ? [{ label: customHabit.trim(), color: HABIT_COLORS[selectedChips.length % HABIT_COLORS.length] }] : []),
  ];

  const goToStep2 = () => {
    if (allHabits.length === 0) {
      Alert.alert('Pick a habit', 'Choose at least one suggestion or type your own.');
      return;
    }
    setStep(2);
  };

  const handleRegister = async () => {
    const { display_name, username, email, password } = form;
    if (!display_name || !username || !email || !password) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (!isValidEmail(email)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Password too short', 'Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      // 1. Register
      const { data } = await api.post('/auth/register', form);
      await login(data.token, data.user);

      // 2. Create all selected habits
      let firstHabitId = null;
      for (const h of allHabits) {
        try {
          const { data: habit } = await api.post('/habits', {
            name: h.label,
            frequency: 'daily',
            color: h.color,
          });
          if (!firstHabitId) firstHabitId = habit.id;
        } catch {
          // Non-fatal — habits can be added later
        }
      }

      navigation.navigate('FindPeople', {
        habitName: allHabits[0]?.label || '',
        habitId: firstHabitId,
        displayName: data.user.display_name,
      });
    } catch (err) {
      Alert.alert('Registration failed', err.response?.data?.error || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 1 ? (
          <View style={styles.section}>
            <Text style={styles.stepIndicator}>Step 1 of 2</Text>
            <Text style={styles.headline}>What's something you want to start doing?</Text>

            <View style={styles.chips}>
              {HABIT_CHIPS.map(chip => {
                const selected = selectedChips.some(c => c.label === chip.label);
                return (
                  <TouchableOpacity
                    key={chip.label}
                    style={[
                      styles.chip,
                      selected && { backgroundColor: `${chip.color}20`, borderColor: chip.color },
                    ]}
                    onPress={() => toggleChip(chip)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.chipText, selected && { color: chip.color }]}>{chip.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.orDivider}>or add your own</Text>
            <TextInput
              style={[styles.input, customHabit.trim() && styles.inputActive]}
              value={customHabit}
              onChangeText={setCustomHabit}
              placeholder="e.g. Cold shower every morning"
              placeholderTextColor={colors.textDim}
              returnKeyType="done"
              maxLength={60}
            />

            <Text style={styles.subtext}>The people who follow you will keep you accountable.</Text>

            <TouchableOpacity
              style={[styles.btn, allHabits.length === 0 && styles.btnDisabled]}
              onPress={goToStep2}
              disabled={allHabits.length === 0}
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>Next →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.section}>
            <TouchableOpacity onPress={() => setStep(1)} style={styles.backRow}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.stepIndicator}>Step 2 of 2</Text>
            <Text style={styles.headline}>Create your account</Text>
            <View style={styles.commitment}>
              <Text style={styles.commitmentLabel}>{allHabits.length === 1 ? 'Your habit' : `Your ${allHabits.length} habits`}</Text>
              {allHabits.map((h, i) => (
                <View key={i} style={styles.commitmentRow}>
                  <View style={[styles.commitmentDot, { backgroundColor: h.color }]} />
                  <Text style={styles.commitmentHabit}>{h.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.form}>
              {[
                { field: 'display_name', label: 'NAME', placeholder: 'Alex Rivera', auto: 'words' },
                { field: 'username', label: 'USERNAME', placeholder: 'alex_rn', auto: 'none' },
                { field: 'email', label: 'EMAIL', placeholder: 'alex@example.com', auto: 'none', keyboard: 'email-address' },
                { field: 'password', label: 'PASSWORD', placeholder: 'At least 6 characters', secure: true },
              ].map(({ field, label, placeholder, auto, keyboard, secure }) => (
                <View key={field} style={styles.field}>
                  <Text style={styles.fieldLabel}>{label}</Text>
                  <TextInput
                    style={[styles.input, field === 'email' && emailError ? styles.inputError : null]}
                    value={form[field]}
                    onChangeText={v => {
                      set(field)(v);
                      if (field === 'email' && emailError) setEmailError('');
                    }}
                    onBlur={field === 'email' ? () => {
                      if (form.email && !isValidEmail(form.email)) {
                        setEmailError('Please enter a valid email (e.g. you@example.com)');
                      }
                    } : undefined}
                    placeholder={placeholder}
                    placeholderTextColor={colors.textDim}
                    autoCapitalize={auto || 'none'}
                    autoCorrect={false}
                    keyboardType={keyboard}
                    secureTextEntry={secure}
                    returnKeyType="next"
                  />
                  {field === 'email' && !!emailError && (
                    <Text style={styles.fieldError}>{emailError}</Text>
                  )}
                </View>
              ))}

              <TouchableOpacity
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={handleRegister}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="white" size="small" />
                  : <Text style={styles.btnText}>Create Account</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: spacing.xxl },
  section: { flex: 1 },
  backRow: { marginBottom: 8 },
  backText: { fontSize: 14, color: colors.textMuted },
  stepIndicator: { fontSize: 12, fontWeight: '600', color: colors.textDim, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  headline: { fontSize: 26, fontWeight: '800', color: colors.text, lineHeight: 32, marginBottom: 24 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: 'transparent',
  },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  orDivider: { fontSize: 12, color: colors.textDim, marginBottom: 8 },
  input: {
    backgroundColor: colors.bgInput, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.sm, color: colors.text, fontSize: 15,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  inputActive: { borderColor: colors.accent },
  inputError: { borderColor: '#ef4444' },
  fieldError: { fontSize: 12, color: '#ef4444', marginTop: 3 },
  subtext: { fontSize: 13, color: colors.textMuted, marginTop: 16, marginBottom: 24, lineHeight: 19 },
  commitment: {
    backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentDimBorder,
    borderRadius: radius.sm, padding: 14, marginBottom: 24,
  },
  commitmentLabel: { fontSize: 11, fontWeight: '700', color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  commitmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  commitmentDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  commitmentHabit: { fontSize: 16, fontWeight: '700', color: colors.text },
  form: { gap: 14 },
  field: { gap: 5 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  btn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: 'white', fontSize: 16, fontWeight: '700' },
}); }
