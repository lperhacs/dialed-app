import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, Image,
} from 'react-native';

const LOGO_OUTLINE = require('../../assets/logo-outline.png');
const LOGO_DARK    = require('../../assets/logo-white.png');
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

export default function LoginScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your username and password.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { username: username.trim(), password });
      await login(data.token, data.user);
    } catch (err) {
      Alert.alert('Login failed', err.response?.data?.error || 'Something went wrong.');
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
        {/* Logo */}
        <View style={styles.logoWrap}>
          <Image
            source={isDark ? LOGO_OUTLINE : LOGO_DARK}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.logoText}>Dialed</Text>
        </View>
        <Text style={styles.tagline}>Build habits. Stay accountable.</Text>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Username or email</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="your_username"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textDim}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={[styles.switchText, { color: colors.accent, fontWeight: '500' }]}>Sign up</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

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
    logoText: { fontSize: 28, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
    tagline: { textAlign: 'center', color: colors.textMuted, fontSize: 14, marginBottom: 36 },

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
    btn: {
      backgroundColor: colors.accent,
      borderRadius: radius.sm,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 4,
    },
    btnDisabled: { opacity: 0.5 },
    btnText: { color: colors.bg, fontSize: 15, fontWeight: '600' },

    demoBox: {
      marginTop: 32,
      padding: 14,
      backgroundColor: colors.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      gap: 3,
    },
    demoTitle: { color: colors.text, fontWeight: '600', fontSize: 13, marginBottom: 2 },
    demoText: { color: colors.textMuted, fontSize: 12 },

    switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
    switchText: { fontSize: 14, color: colors.textMuted },
  });
}
