import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import api from '../api/client';
import { useAuth } from './AuthContext';

const BadgeContext = createContext({ notifCount: 0, msgCount: 0, refresh: () => {} });

export function BadgeProvider({ children }) {
  const { user } = useAuth();
  const [notifCount, setNotifCount] = useState(0);
  const [msgCount, setMsgCount] = useState(0);
  const intervalRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get('/notifications/counts');
      setNotifCount(data.notifications ?? 0);
      setMsgCount(data.messages ?? 0);
    } catch (_) {}
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotifCount(0);
      setMsgCount(0);
      return;
    }
    refresh();
    intervalRef.current = setInterval(refresh, 5_000);
    return () => clearInterval(intervalRef.current);
  }, [user, refresh]);

  // Also refresh when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return (
    <BadgeContext.Provider value={{ notifCount, msgCount, refresh }}>
      {children}
    </BadgeContext.Provider>
  );
}

export function useBadges() {
  return useContext(BadgeContext);
}
