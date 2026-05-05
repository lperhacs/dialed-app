import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

export default function ResetPasswordScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const emailParam = route?.params?.email || '';
  const [email, setEmail] = useState(emailParam);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleReset = async () => {
    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();
    if (!trimmedEmail || !trimmedCode || !password) {
      Alert.alert('Missing fields', 'Enter the code and your new password.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwords don\u2019t match', 'Please re-enter your new password.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        email: trimmedEmail,
        code: trimmedCode,
        new_password: password,
      });
      Alert.alert(
        'Password reset',
        'Your password has been updated. Please sign in with your new password.',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }],
      );
    } catch (err) {
      Alert.alert(
        'Could not reset',
        err.response?.data?.error || 'Check the code and try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert('Email required', 'Enter your email to resend the code.');
      return;
    }
    setResending(true);
    try {
      await api.post('/auth/forgot-password', { email: trimmedEmail });
      Alert.alert('Code sent', 'If that email matches an account, a new code is on its way.');
    } catch (err) {
      Alert.alert('Could not resend', err.response?.data?.error || 'Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} hitSlop={10}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.iconWrap}>
          <Ionicons name="key" size={36} color={colors.accent} />
        </View>

        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit code we sent to your email and choose a new password.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textDim}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>6-digit code</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            placeholderTextColor={colors.textDim}
            keyboardType="number-pad"
            maxLength={6}
            returnKeyType="next"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>New password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            placeholderTextColor={colors.textDim}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Confirm new password</Text>
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Re-enter password"
            placeholderTextColor={colors.textDim}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleReset}
          />
        </View>

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleReset}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>{loading ? 'Resetting\u2026' : 'Reset password'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleResend}
          disabled={resending}
          style={styles.linkRow}
          activeOpacity={0.7}
        >
          <Text style={styles.linkText}>
            {resending ? 'Sending\u2026' : 'Resend code'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('Login')}
          style={styles.linkRow}
          activeOpacity={0.7}
        >
          <Text style={styles.linkText}>Back to sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    scroll: { flexGrow: 1, padding: spacing.xxl, paddingTop: 60 },
    back: { position: 'absolute', top: 50, left: spacing.lg, zIndex: 1 },
    iconWrap: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: colors.bgCard,
      borderWidth: 1, borderColor: colors.borderSubtle,
      justifyContent: 'center', alignItems: 'center',
      alignSelf: 'center', marginBottom: 20, marginTop: 20,
    },
    title: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 8 },
    subtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 28, lineHeight: 20 },
    field: { gap: 5, marginBottom: 14 },
    label: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
    input: {
      backgroundColor: colors.bgInput,
      borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.sm,
      color: colors.text,
      fontSize: 15,
      paddingHorizontal: 14, paddingVertical: 12,
    },
    codeInput: { fontSize: 20, letterSpacing: 6, textAlign: 'center', fontWeight: '600' },
    btn: {
      backgroundColor: colors.accent,
      borderRadius: radius.sm,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 8,
    },
    btnDisabled: { opacity: 0.5 },
    btnText: { color: colors.bg, fontSize: 15, fontWeight: '600' },
    linkRow: { alignItems: 'center', marginTop: 16 },
    linkText: { fontSize: 14, color: colors.textMuted },
  });
}
