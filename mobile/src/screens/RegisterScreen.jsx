import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, Image, Modal,
} from 'react-native';

const LOGO_OUTLINE = require('../../assets/logo-outline.png');
const LOGO_DARK    = require('../../assets/logo-white.png');
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

export default function RegisterScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  const { login } = useAuth();
  const [form, setForm] = useState({ display_name: '', username: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [modal, setModal] = useState(null); // 'terms' | 'privacy' | null
  const [emailError, setEmailError] = useState('');

  const set = field => value => setForm(f => ({ ...f, [field]: value }));

  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

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
    if (!agreed) {
      Alert.alert('Agreement required', 'Please agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', form);
      await login(data.token, data.user);
    } catch (err) {
      Alert.alert('Registration failed', err.response?.data?.error || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <Image
            source={isDark ? LOGO_OUTLINE : LOGO_DARK}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.logoText}>Join Dialed</Text>
        </View>
        <Text style={styles.tagline}>Build habits. Stay accountable.</Text>

        <View style={styles.form}>
          {[
            { field: 'display_name', label: 'Display name', placeholder: 'Alex Rivera', auto: 'words' },
            { field: 'username',     label: 'Username',     placeholder: 'alex_rn',       auto: 'none' },
            { field: 'email',        label: 'Email',        placeholder: 'alex@example.com', auto: 'none', keyboard: 'email-address' },
            { field: 'password',     label: 'Password',     placeholder: 'At least 6 characters', secure: true },
          ].map(({ field, label, placeholder, auto, keyboard, secure }) => (
            <View key={field} style={styles.field}>
              <Text style={styles.label}>{label}</Text>
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
            style={styles.checkRow}
            onPress={() => setAgreed(a => !a)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
              {agreed && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkLabel}>
              I agree to the{' '}
              <Text style={styles.checkLink} onPress={() => setModal('terms')}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={styles.checkLink} onPress={() => setModal('privacy')}>Privacy Policy</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, (!agreed || loading) && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={!agreed || loading}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>{loading ? 'Creating account…' : 'Create account'}</Text>
          </TouchableOpacity>
        </View>

        <Modal visible={modal !== null} animationType="slide" presentationStyle="pageSheet">
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {modal === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
              </Text>
              <TouchableOpacity onPress={() => setModal(null)}>
                <Text style={styles.modalClose}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} contentContainerStyle={{ padding: 20 }}>
              {modal === 'terms' ? (
                <Text style={styles.modalBody}>{TERMS_TEXT}</Text>
              ) : (
                <Text style={styles.modalBody}>{PRIVACY_TEXT}</Text>
              )}
            </ScrollView>
          </View>
        </Modal>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={[styles.switchText, { color: colors.accent, fontWeight: '500' }]}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const TERMS_TEXT = `Terms of Service
Last updated: April 19, 2026

By using Dialed, you agree to the following:

1. ELIGIBILITY
You must be at least 13 years old to use the App.

2. YOUR ACCOUNT
You are responsible for your account and all activity that occurs under it. You must provide accurate information when registering.

3. ACCEPTABLE USE
You agree not to post illegal, abusive, threatening, or harassing content; impersonate others; spam users; attempt unauthorized access to the App; or use the App for commercial purposes without consent.

4. YOUR CONTENT
You retain ownership of content you post. By posting, you grant Dialed a license to display it within the App. You are responsible for what you post.

5. TERMINATION
We may suspend or terminate your account for violations of these Terms at any time.

6. DISCLAIMERS
The App is provided "as is" without warranties of any kind. Use is at your own risk.

7. LIMITATION OF LIABILITY
Dialed is not liable for indirect, incidental, or consequential damages arising from your use of the App.

8. GOVERNING LAW
These Terms are governed by the laws of the State of Texas.

For questions, contact us through the App.`;

const PRIVACY_TEXT = `Privacy Policy
Last updated: April 19, 2026

1. WHAT WE COLLECT
- Account info: name, email, username, password
- Profile info: photo, bio, location (optional)
- Content: habits, posts, comments, messages
- Usage data: how you interact with the App

2. HOW WE USE IT
- To run and improve the App
- To display your profile and content to other users
- To send notifications about your account
- To respond to support requests

3. WHAT WE DON'T DO
- We do not sell your data to third parties
- We do not use your data for advertising
- We do not collect precise GPS location

4. HOW WE SHARE IT
Your public content is visible to other Dialed users. We use Railway for secure server hosting. We may share data if required by law.

5. YOUR RIGHTS
You can access, correct, or delete your data at any time. To delete your account, use the settings in the App.

6. CHILDREN
The App is not intended for users under 13. We do not knowingly collect data from children under 13.

7. CHANGES
We will notify you of significant changes to this policy through the App.

For questions, contact us through the App.`;

function makeStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xxl },

    logoWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginBottom: 8,
    },
    logoImage: { width: 38, height: 38 },
    logoText: { fontSize: 26, fontWeight: '700', color: colors.text, letterSpacing: -0.4 },
    tagline: { textAlign: 'center', color: colors.textMuted, fontSize: 14, marginBottom: 32 },

    form: { gap: 14 },
    field: { gap: 5 },
    label: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
    input: {
      backgroundColor: colors.bgInput,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      color: colors.text,
      fontSize: 15,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    inputError: { borderColor: '#ef4444' },
    fieldError: { fontSize: 12, color: '#ef4444', marginTop: 3 },
    btn: {
      backgroundColor: colors.accent,
      borderRadius: radius.sm,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 4,
    },
    btnDisabled: { opacity: 0.5 },
    btnText: { color: colors.bg, fontSize: 15, fontWeight: '600' },

    switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
    switchText: { fontSize: 14, color: colors.textMuted },

    checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4 },
    checkbox: {
      width: 20, height: 20, borderRadius: 4,
      borderWidth: 1.5, borderColor: colors.border,
      backgroundColor: colors.bgInput,
      alignItems: 'center', justifyContent: 'center',
      marginTop: 1,
    },
    checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
    checkmark: { color: colors.bg, fontSize: 12, fontWeight: '700' },
    checkLabel: { flex: 1, fontSize: 13, color: colors.textMuted, lineHeight: 20 },
    checkLink: { color: colors.accent, fontWeight: '500' },

    modalContainer: { flex: 1, backgroundColor: colors.bg },
    modalHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    modalTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
    modalClose: { fontSize: 16, color: colors.accent, fontWeight: '500' },
    modalScroll: { flex: 1 },
    modalBody: { fontSize: 14, color: colors.textMuted, lineHeight: 22 },
  });
}
