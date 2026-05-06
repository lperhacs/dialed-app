import 'react-native-gesture-handler';
import React from 'react';
import { View, Text, Platform } from 'react-native';
import { registerRootComponent } from 'expo';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { BadgeProvider } from './src/context/BadgeContext';
import { ProProvider } from './src/context/ProContext';
import RootNavigator from './src/navigation/RootNavigator';
import { API_BASE_URL } from './src/theme';

// ── Global JS error reporter ─────────────────────────────────────────────────
// Captures uncaught JS errors and ships them to the backend so we can see
// what's crashing on testers' devices. TestFlight crash reports only show
// the native abort, not the JS message — this fills that gap.
//
// Uses raw fetch (not axios) so it works even if axios setup is what failed.
// Wrapped end-to-end so the reporter can never itself crash the app.
(function installGlobalErrorReporter() {
  try {
    const origHandler = global.ErrorUtils && global.ErrorUtils.getGlobalHandler && global.ErrorUtils.getGlobalHandler();
    if (!global.ErrorUtils || !global.ErrorUtils.setGlobalHandler) return;

    global.ErrorUtils.setGlobalHandler(async (error, isFatal) => {
      try {
        // Server drops any client-supplied user_id — it now reads the user
        // from a Bearer token (optionalAuth). Send the token if we have one.
        let token = null;
        try {
          token = await AsyncStorage.getItem('dialed_token');
        } catch (_) {}

        const body = {
          message: (error && (error.message || String(error))) || 'unknown error',
          stack: (error && error.stack) ? String(error.stack) : '',
          is_fatal: !!isFatal,
          platform: Platform.OS,
          app_version: (Constants.expoConfig && Constants.expoConfig.version) || '',
          os_version: String(Platform.Version || ''),
        };

        // Best-effort, fire-and-forget. 3s timeout so a slow network doesn't
        // delay whatever fatal-handling RN wants to do next.
        const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 3000) : null;
        try {
          const headers = { 'Content-Type': 'application/json' };
          if (token) headers.Authorization = `Bearer ${token}`;
          await fetch(`${API_BASE_URL}/api/analytics/jserror`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: ctrl ? ctrl.signal : undefined,
          });
        } catch (_) {}
        if (timer) clearTimeout(timer);
      } catch (_) {}

      // Always defer to the original handler so RN's default behavior
      // (red box in dev, fatal in prod) still applies.
      if (typeof origHandler === 'function') {
        try { origHandler(error, isFatal); } catch (_) {}
      }
    });
  } catch (_) {
    // If install itself fails, silently continue — no reporting is better
    // than a bricked app on launch.
  }
})();

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0c0c0e', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ color: '#f87171', fontSize: 16, fontWeight: '600', marginBottom: 8 }}>Something went wrong</Text>
          <Text style={{ color: '#65656e', fontSize: 13, textAlign: 'center' }}>{this.state.error.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function AppInner() {
  const { navTheme, isDark } = useTheme();
  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </NavigationContainer>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <AuthProvider>
              <ProProvider>
                <BadgeProvider>
                  <AppInner />
                </BadgeProvider>
              </ProProvider>
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

registerRootComponent(App);
