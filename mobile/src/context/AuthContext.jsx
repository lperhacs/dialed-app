import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';
import { registerPushToken } from '../utils/notifications';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = await AsyncStorage.getItem('dialed_token');
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
      await AsyncStorage.setItem('dialed_user', JSON.stringify(data));
      registerPushToken();
    } catch {
      await AsyncStorage.multiRemove(['dialed_token', 'dialed_user']);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Seed user state from storage first (instant), then verify with server
    const init = async () => {
      try {
        const userStr = await AsyncStorage.getItem('dialed_user');
        if (userStr) setUser(JSON.parse(userStr));
      } catch {
        await AsyncStorage.multiRemove(['dialed_token', 'dialed_user']);
      }
      refresh();
    };
    init();
  }, [refresh]);

  const login = async (token, userData) => {
    await AsyncStorage.setItem('dialed_token', token);
    await AsyncStorage.setItem('dialed_user', JSON.stringify(userData));
    setUser(userData);
    registerPushToken();
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(['dialed_token', 'dialed_user']);
    setUser(null);
  };

  const updateUser = async (userData) => {
    const merged = { ...user, ...userData };
    await AsyncStorage.setItem('dialed_user', JSON.stringify(merged));
    setUser(merged);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
