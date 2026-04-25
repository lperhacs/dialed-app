import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import api from '../api/client';
import Avatar from '../components/Avatar';
import StreakBadge from '../components/StreakBadge';
import { radius, spacing } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

function RankNum({ rank }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return <Text style={rank <= 3 ? styles.rankTop : styles.rankNum}>#{rank}</Text>;
}

function LeaderRow({ entry, currentUserId }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const isMe = entry.id === currentUserId;

  return (
    <TouchableOpacity
      style={[styles.row, isMe && styles.rowMe]}
      onPress={() => navigation.navigate('UserProfile', { username: entry.username })}
      activeOpacity={0.8}
    >
      <View style={{ width: 38, alignItems: 'center' }}>
        <RankNum rank={entry.rank} />
      </View>
      <Avatar user={entry} size="sm" />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName}>
          {entry.display_name}
          {isMe && <Text style={{ color: colors.accent }}> (you)</Text>}
        </Text>
        <Text style={styles.rowHandle}>@{entry.username}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <StreakBadge streak={entry.max_streak || entry.streak || 0} />
        <Text style={styles.rowSub}>{entry.total_logs || 0} total</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function LeaderboardScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { user } = useAuth();
  const [tab, setTab] = useState('friends');
  const [data, setData] = useState([]);
  const [myChallenges, setMyChallenges] = useState([]);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [challengeBoard, setChallengeBoard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData([]);
    if (tab === 'friends') {
      api.get('/leaderboard/friends').then(r => setData(r.data)).finally(() => setLoading(false));
    } else if (tab === 'global') {
      api.get('/leaderboard/global').then(r => setData(r.data)).finally(() => setLoading(false));
    } else {
      api.get('/leaderboard/challenges').then(r => {
        setMyChallenges(r.data);
        if (r.data.length > 0 && !selectedChallenge) setSelectedChallenge(r.data[0].id);
        setLoading(false);
      });
    }
  }, [tab]);

  useEffect(() => {
    if (tab === 'clubs' && selectedChallenge) {
      setLoading(true);
      api.get(`/leaderboard/challenges/${selectedChallenge}`)
        .then(r => setChallengeBoard(r.data))
        .finally(() => setLoading(false));
    }
  }, [selectedChallenge, tab]);

  const listData = tab === 'clubs' ? (challengeBoard?.members || []) : data;

  return (
    <View style={styles.container}>
      {/* Tab row */}
      <View style={styles.tabRow}>
        {['friends', 'clubs', 'global'].map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={styles.tabBtn}>
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
            {tab === t && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Challenge selector */}
      {tab === 'clubs' && myChallenges.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.challengeScroll}
        >
          {myChallenges.map(c => (
            <TouchableOpacity
              key={String(c.id)}
              style={[styles.challengeChip, selectedChallenge === c.id && styles.challengeChipActive]}
              onPress={() => setSelectedChallenge(c.id)}
            >
              <Text style={[styles.challengeChipText, selectedChallenge === c.id && { color: colors.accent }]}>
                {c.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>
      ) : listData.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No data yet</Text>
          <Text style={styles.emptyText}>
            {tab === 'friends' ? 'Follow people to see them here.' :
             tab === 'clubs' ? 'Join a club first.' :
             'Start logging habits to rank globally.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={item => String(item.id)}
          renderItem={({ item }) => <LeaderRow entry={item} currentUserId={user?.id} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 13, position: 'relative' },
  tabLabel: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  tabLabelActive: { color: colors.accent },
  tabIndicator: { position: 'absolute', bottom: 0, height: 2, width: '40%', backgroundColor: colors.accent, borderRadius: 1 },
  challengeScroll: { paddingHorizontal: spacing.lg, paddingVertical: 10, gap: 8 },
  challengeChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm,
    backgroundColor: colors.bgHover, borderWidth: 1, borderColor: colors.borderSubtle,
  },
  challengeChipActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  challengeChipText: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  rowMe: { backgroundColor: colors.accentDim },
  rankTop: { fontSize: 14, fontWeight: '700', color: colors.accent },
  rankNum: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  rowName: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowHandle: { fontSize: 12, color: colors.textMuted },
  rowSub: { fontSize: 11, color: colors.textDim, marginTop: 2 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 6 },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
  });
}
