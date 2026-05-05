import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

export default function ForgotPasswordScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert('Email required', 'Enter the email on your account.');
      return;
    }
    setLoading(true);
    try {
      // Backend always returns 200 to avoid leaking whether the email exists.
      await api.post('/auth/forgot-password', { email: trimmed });
      navigation.navigate('ResetPassword', { email: trimmed });
    } catch (err) {
      Alert.alert('Could not send', err.response?.data?.error || 'Please try again.');
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} hitSlop={10}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed" size={36} color={colors.accent} />
        </View>

        <Text style={styles.title}>Forgot password?</Text>
        <Text style={styles.subtitle}>
          Enter your email and we'll send you a 6-digit code to reset it.
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
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
        </View>

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleSend}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>{loading ? 'Sending…' : 'Send reset code'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.linkRow} activeOpacity={0.7}>
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
    subtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 32, lineHeight: 20 },
    field: { gap: 5, marginBottom: 16 },
    label: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
    input: {
      backgroundColor: colors.bgInput,
      borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.sm,
      color: colors.text,
      fontSize: 15,
      paddingHorizontal: 14, paddingVertical: 12,
    },
    btn: {
      backgroundColor: colors.accent,
      borderRadius: radius.sm,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 4,
    },
    btnDisabled: { opacity: 0.5 },
    btnText: { color: colors.bg, fontSize: 15, fontWeight: '600' },
    linkRow: { alignItems: 'center', marginTop: 20 },
    linkText: { fontSize: 14, color: colors.textMuted },
  });
}
