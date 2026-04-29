import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { radius, spacing } from '../theme';

export default function EmailVerificationScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { updateUser } = useAuth();
  const styles = makeStyles(colors);

  const email = route?.params?.email || '';
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 400);
    return () => clearInterval(timerRef.current);
  }, []);

  const startCooldown = () => {
    setCooldown(60);
    timerRef.current = setInterval(() => {
      setCooldown(c => {
        if (c <= 1) { clearInterval(timerRef.current); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    try {
      const { data } = await api.post('/auth/verify-email', { code });
      await updateUser({ email_verified: true });
      navigation.replace('MainTabs');
    } catch (err) {
      Alert.alert('Incorrect code', err.response?.data?.error || 'Please try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setResending(true);
    try {
      await api.post('/auth/resend-verification');
      startCooldown();
      Alert.alert('Code sent', 'A new code has been sent to your email.');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not resend. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const handleCodeChange = (text) => {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) {
      // auto-submit when all 6 digits entered
      setTimeout(() => handleVerifyWithCode(digits), 100);
    }
  };

  const handleVerifyWithCode = async (c) => {
    setLoading(true);
    try {
      await api.post('/auth/verify-email', { code: c });
      await updateUser({ email_verified: true });
      navigation.replace('MainTabs');
    } catch (err) {
      Alert.alert('Incorrect code', err.response?.data?.error || 'Please try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <View style={styles.iconWrap}>
          <Ionicons name="mail" size={40} color={colors.accent} />
        </View>

        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to{'\n'}
          <Text style={styles.email}>{email}</Text>
        </Text>

        {/* Hidden input drives the code display */}
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={handleCodeChange}
          keyboardType="number-pad"
          maxLength={6}
          style={styles.hiddenInput}
          autoComplete="one-time-code"
        />

        {/* Visual digit boxes */}
        <TouchableOpacity
          style={styles.digitRow}
          onPress={() => inputRef.current?.focus()}
          activeOpacity={1}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.digitBox,
                code.length === i && styles.digitBoxActive,
                code.length > i && styles.digitBoxFilled,
              ]}
            >
              <Text style={styles.digitText}>{code[i] || ''}</Text>
            </View>
          ))}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.verifyBtn, (code.length < 6 || loading) && styles.btnDisabled]}
          onPress={handleVerify}
          disabled={code.length < 6 || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color={colors.bg} />
            : <Text style={styles.verifyBtnText}>Verify email</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleResend}
          disabled={cooldown > 0 || resending}
          activeOpacity={0.7}
          style={styles.resendRow}
        >
          <Text style={[styles.resendText, (cooldown > 0 || resending) && { opacity: 0.4 }]}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : resending ? 'Sending…' : 'Resend code'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.replace('MainTabs')}
          activeOpacity={0.7}
          style={styles.skipRow}
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    inner: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xxl,
      gap: 16,
    },
    iconWrap: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: `${colors.accent}18`,
      justifyContent: 'center', alignItems: 'center',
      marginBottom: 4,
    },
    title: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' },
    subtitle: { fontSize: 15, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
    email: { color: colors.text, fontWeight: '600' },

    hiddenInput: {
      position: 'absolute',
      opacity: 0,
      width: 1,
      height: 1,
    },
    digitRow: { flexDirection: 'row', gap: 10, marginVertical: 8 },
    digitBox: {
      width: 46, height: 56, borderRadius: radius.sm,
      borderWidth: 1.5, borderColor: colors.border,
      backgroundColor: colors.bgInput,
      justifyContent: 'center', alignItems: 'center',
    },
    digitBoxActive: { borderColor: colors.accent },
    digitBoxFilled: { borderColor: colors.accent, backgroundColor: `${colors.accent}12` },
    digitText: { fontSize: 22, fontWeight: '700', color: colors.text },

    verifyBtn: {
      backgroundColor: colors.accent,
      borderRadius: radius.sm,
      paddingVertical: 14,
      width: '100%',
      alignItems: 'center',
      marginTop: 4,
    },
    btnDisabled: { opacity: 0.45 },
    verifyBtnText: { color: colors.bg, fontSize: 16, fontWeight: '600' },

    resendRow: { paddingVertical: 4 },
    resendText: { fontSize: 14, color: colors.accent, fontWeight: '500' },

    skipRow: { paddingVertical: 4 },
    skipText: { fontSize: 13, color: colors.textMuted },
  });
}
