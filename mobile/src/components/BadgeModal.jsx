import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import api from '../api/client';
import { getBadgeInfo } from './BadgeChip';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

export default function BadgeModal({ visible, username, isMe, onClose }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pinning, setPinning] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/users/${username}/badges`)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [username]);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  const togglePin = async (badge) => {
    setPinning(badge.id);
    try {
      await api.patch(`/users/profile/badges/${badge.id}/pin`);
      load();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not update badge');
    } finally {
      setPinning(null);
    }
  };

  const earned = data?.earned || [];
  const all = data?.all || [];
  const locked = all.filter(b => !b.earned);

  const renderEarned = ({ item: b }) => {
    const info = getBadgeInfo(b.badge_type);
    return (
      <View style={[styles.row, b.pinned && styles.rowPinned]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.badgeLabel}>{info.label}</Text>
          <Text style={styles.badgeDesc}>{info.desc}</Text>
          {b.habit_name && (
            <View style={styles.habitRow}>
              <View style={[styles.habitDot, { backgroundColor: b.habit_color || colors.accent }]} />
              <Text style={styles.habitName}>{b.habit_name}</Text>
            </View>
          )}
        </View>
        {isMe && (
          <TouchableOpacity
            style={[styles.pinBtn, b.pinned && styles.pinBtnActive]}
            onPress={() => togglePin(b)}
            disabled={pinning === b.id}
            activeOpacity={0.8}
          >
            {pinning === b.id
              ? <ActivityIndicator size="small" color={b.pinned ? 'white' : colors.accent} />
              : <Text style={[styles.pinBtnText, b.pinned && styles.pinBtnTextActive]}>{b.pinned ? 'Pinned' : 'Pin'}</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderLocked = ({ item: b }) => (
    <View style={[styles.row, { opacity: 0.35 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.badgeLabel}>{b.label}</Text>
        <Text style={styles.badgeDesc}>{b.desc}</Text>
      </View>
      <Text style={styles.lockedText}>Locked</Text>
    </View>
  );

  const sections = [
    ...(earned.length ? [{ type: 'header', title: `Earned · ${earned.length}`, key: 'h1' }] : []),
    ...earned.map(b => ({ type: 'earned', ...b, key: `e-${b.id}` })),
    ...(locked.length ? [{ type: 'header', title: `Locked · ${locked.length}`, key: 'h2' }] : []),
    ...locked.map(b => ({ type: 'locked', ...b, key: `l-${b.type}` })),
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Badges</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>Done</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={sections}
            keyExtractor={item => item.key}
            contentContainerStyle={{ padding: spacing.lg, gap: 6 }}
            renderItem={({ item }) => {
              if (item.type === 'header') {
                return <Text style={styles.sectionHeader}>{item.title}</Text>;
              }
              if (item.type === 'earned') return renderEarned({ item });
              return renderLocked({ item });
            }}
            ListEmptyComponent={
              <Text style={{ color: colors.textMuted, textAlign: 'center', paddingTop: 20 }}>No badges earned yet.</Text>
            }
          />
        )}
      </View>
    </Modal>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.lg,
      paddingTop: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    title: { fontSize: 20, fontWeight: '800', color: colors.text },
    sectionHeader: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: 16,
      marginBottom: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: colors.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    rowPinned: { borderColor: colors.accent },
    badgeLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
    badgeDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    habitRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
    habitDot: { width: 7, height: 7, borderRadius: 4 },
    habitName: { fontSize: 12, color: colors.textDim },
    pinBtn: {
      borderWidth: 1.5,
      borderColor: colors.accent,
      borderRadius: radius.pill,
      paddingHorizontal: 14,
      paddingVertical: 5,
      minWidth: 64,
      alignItems: 'center',
    },
    pinBtnActive: { backgroundColor: colors.accent },
    pinBtnText: { fontSize: 12, fontWeight: '700', color: colors.accent },
    pinBtnTextActive: { color: 'white' },
    lockedText: { fontSize: 12, color: colors.textDim },
  });
}
