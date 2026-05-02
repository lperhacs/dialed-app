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

  const inFlight = useRef(false);
  const consecutive401s = useRef(0);
  const refresh = useCallback(async () => {
    if (!user || inFlight.current) return;
    inFlight.current = true;
    try {
      const { data } = await api.get('/notifications/counts');
      setNotifCount(data.notifications ?? 0);
      setMsgCount(data.messages ?? 0);
      consecutive401s.current = 0;
    } catch (err) {
      if (err?.response?.status === 401) {
        consecutive401s.current += 1;
        if (consecutive401s.current >= 3) {
          console.warn('BadgeContext: 3 consecutive 401s on /notifications/counts');
        }
      }
    } finally {
      inFlight.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotifCount(0);
      setMsgCount(0);
      consecutive401s.current = 0;
      return;
    }
    refresh();
    // TODO: api/client.js global 401 interceptor force-logs-out on transient 401s.
    // Polling at 30s reduces blast radius until interceptor is made tolerant.
    intervalRef.current = setInterval(refresh, 30_000);
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
