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

export default function RegisterScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  const { login } = useAuth();
  const [form, setForm] = useState({ display_name: '', username: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const set = field => value => setForm(f => ({ ...f, [field]: value }));

  const handleRegister = async () => {
    const { display_name, username, email, password } = form;
    if (!display_name || !username || !email || !password) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
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
                style={styles.input}
                value={form[field]}
                onChangeText={set(field)}
                placeholder={placeholder}
                placeholderTextColor={colors.textDim}
                autoCapitalize={auto || 'none'}
                autoCorrect={false}
                keyboardType={keyboard}
                secureTextEntry={secure}
                returnKeyType="next"
              />
            </View>
          ))}

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>{loading ? 'Creating account…' : 'Create account'}</Text>
          </TouchableOpacity>
        </View>

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
  });
}
