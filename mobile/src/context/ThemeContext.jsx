import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, makeNavTheme } from '../theme';

const THEME_KEY = 'dialed_theme';

const ThemeContext = createContext({
  colors: darkColors,
  navTheme: makeNavTheme(darkColors, true),
  isDark: true,
  themeMode: 'system',
  setThemeMode: () => {},
});

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme(); // 'dark' | 'light' | null
  const [themeMode, setThemeModeState] = useState('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(v => {
      if (v) setThemeModeState(v);
      setReady(true);
    });
  }, []);

  const setThemeMode = async (mode) => {
    setThemeModeState(mode);
    await AsyncStorage.setItem(THEME_KEY, mode);
  };

  const isDark = themeMode === 'system'
    ? systemScheme !== 'light'   // default dark when null/undefined
    : themeMode === 'dark';

  const value = useMemo(() => {
    const c = isDark ? darkColors : lightColors;
    return {
      colors: c,
      navTheme: makeNavTheme(c, isDark),
      isDark,
      themeMode,
      setThemeMode,
    };
  }, [isDark, themeMode]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
