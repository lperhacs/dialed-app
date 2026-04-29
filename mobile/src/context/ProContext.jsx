import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';

const ProContext = createContext(null);

export function ProProvider({ children }) {
  const { user } = useAuth();
  const [isPro, setIsPro] = useState(false);
  const [streakFreezes, setStreakFreezes] = useState(0);
  const [proExpiresAt, setProExpiresAt] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setIsPro(false); setStreakFreezes(0); return; }
    try {
      setLoading(true);
      const { data } = await api.get('/pro/status');
      setIsPro(data.is_pro);
      setStreakFreezes(data.streak_freezes);
      setProExpiresAt(data.pro_expires_at);
    } catch {
      // Non-critical — keep defaults
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Seed from user object on auth (avoids extra request on cold start)
  useEffect(() => {
    if (user) {
      if (user.is_pro !== undefined) setIsPro(!!user.is_pro);
      if (user.streak_freezes !== undefined) setStreakFreezes(user.streak_freezes);
    }
  }, [user]);

  const useFreeze = async (habitId) => {
    const { data } = await api.post('/pro/use-freeze', { habit_id: habitId });
    setStreakFreezes(data.freezes_remaining);
    return data;
  };

  return (
    <ProContext.Provider value={{ isPro, streakFreezes, proExpiresAt, loading, refresh, useFreeze }}>
      {children}
    </ProContext.Provider>
  );
}

export const usePro = () => useContext(ProContext);
