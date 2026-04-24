import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, SectionList, FlatList,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import Avatar from '../components/Avatar';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

const HISTORY_KEY = 'dialed_search_history';
const MAX_HISTORY = 10;

async function loadHistory() {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveToHistory(term) {
  try {
    const prev = await loadHistory();
    const next = [term, ...prev.filter(t => t.toLowerCase() !== term.toLowerCase())].slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

async function removeFromHistory(term) {
  try {
    const prev = await loadHistory();
    const next = prev.filter(t => t !== term);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

async function clearHistory() {
  try {
    await AsyncStorage.removeItem(HISTORY_KEY);
  } catch {}
}

function timeUntil(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((d - now) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'Past';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7) return `${diff}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function PersonRow({ user }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => navigation.navigate('UserProfile', { username: user.username })}
      activeOpacity={0.75}
    >
      <Avatar user={user} size="md" />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{user.display_name}</Text>
        <Text style={styles.rowSub}>@{user.username}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
    </TouchableOpacity>
  );
}

function EventRow({ event }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.row}>
      <View style={styles.typeIcon}>
        <Ionicons name="calendar-outline" size={18} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{event.title}</Text>
        <Text style={styles.rowSub}>
          {timeUntil(event.event_date)}
          {event.location ? ` · ${event.location}` : ''}
          {` · ${event.going_count ?? 0} going`}
        </Text>
      </View>
    </View>
  );
}

function ClubRow({ club }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => navigation.navigate('ClubDetail', { id: club.id })}
      activeOpacity={0.75}
    >
      <View style={styles.typeIcon}>
        <Ionicons name="people-outline" size={18} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{club.name}</Text>
        <Text style={styles.rowSub}>
          {club.member_count} {club.member_count === 1 ? 'member' : 'members'}
          {club.frequency ? ` · ${club.frequency}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
    </TouchableOpacity>
  );
}

function SectionHeader({ title, count }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {count != null && <Text style={styles.sectionCount}>{count}</Text>}
    </View>
  );
}

export default function SearchScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [people, setPeople] = useState([]);
  const [events, setEvents] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [history, setHistory] = useState([]);

  // Load history when screen focuses
  useFocusEffect(useCallback(() => {
    loadHistory().then(setHistory);
  }, []));

  // Search effect - fires on debounce and saves to history
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setPeople([]); setEvents([]); setClubs([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      const [pRes, eRes, cRes] = await Promise.allSettled([
        api.get(`/users/search?q=${encodeURIComponent(q)}`),
        api.get(`/events/search?q=${encodeURIComponent(q)}`),
        api.get(`/clubs/search?q=${encodeURIComponent(q)}`),
      ]);
      setPeople(pRes.status === 'fulfilled' ? pRes.value.data : []);
      setEvents(eRes.status === 'fulfilled' ? eRes.value.data : []);
      setClubs(cRes.status === 'fulfilled' ? cRes.value.data : []);
      setLoading(false);
      // Save to history after successful search
      saveToHistory(q).then(setHistory);
    }, 600);
    return () => clearTimeout(timer);
  }, [query]);

  const tapHistoryItem = (term) => {
    setQuery(term);
  };

  const removeHistoryItem = async (term) => {
    const next = await removeFromHistory(term);
    setHistory(next);
  };

  const handleClearAll = async () => {
    await clearHistory();
    setHistory([]);
  };

  const hasResults = people.length > 0 || events.length > 0 || clubs.length > 0;
  const searched = query.trim().length >= 2;

  const sections = [];
  if (people.length > 0) sections.push({ title: 'People', count: people.length, data: people, type: 'person' });
  if (events.length > 0) sections.push({ title: 'Events', count: events.length, data: events, type: 'event' });
  if (clubs.length > 0)  sections.push({ title: 'Clubs',  count: clubs.length,  data: clubs,  type: 'club'  });

  const showHistory = !searched && history.length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="People, events, clubs…"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Recent searches */}
      {showHistory && (
        <View style={{ flex: 1 }}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>Recent</Text>
            <TouchableOpacity onPress={handleClearAll} hitSlop={8}>
              <Text style={styles.clearAll}>Clear all</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={history}
            keyExtractor={item => item}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.historyRow}
                onPress={() => tapHistoryItem(item)}
                activeOpacity={0.75}
              >
                <Ionicons name="time-outline" size={16} color={colors.textMuted} style={{ marginRight: 12 }} />
                <Text style={styles.historyText} numberOfLines={1}>{item}</Text>
                <TouchableOpacity onPress={() => removeHistoryItem(item)} hitSlop={10} style={styles.historyRemove}>
                  <Ionicons name="close" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Results / empty states */}
      {!showHistory && (
        loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} size="small" />
          </View>
        ) : !searched ? (
          <View style={styles.center}>
            <Ionicons name="search-outline" size={36} color={colors.textDim} />
            <Text style={styles.hintText}>Search people, events, and clubs</Text>
          </View>
        ) : !hasResults ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>No results</Text>
            <Text style={styles.emptyText}>Try a different search term</Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
            renderSectionHeader={({ section }) => (
              <SectionHeader title={section.title} count={section.count} />
            )}
            renderItem={({ item, section }) => {
              if (section.type === 'person') return <PersonRow user={item} />;
              if (section.type === 'event')  return <EventRow  event={item} />;
              if (section.type === 'club')   return <ClubRow   club={item}  />;
              return null;
            }}
            stickySectionHeadersEnabled={false}
          />
        )
      )}
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    backBtn: { width: 32 },
    searchBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bgHover,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    searchInput: { flex: 1, color: colors.text, fontSize: 15 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: 40 },
    hintText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 8 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    emptyText: { fontSize: 14, color: colors.textMuted },
    // History
    historyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: 18,
      paddingBottom: 6,
    },
    historyTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
    clearAll: { fontSize: 13, color: colors.accent, fontWeight: '600' },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: 13,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    historyText: { flex: 1, fontSize: 15, color: colors.text },
    historyRemove: { paddingLeft: 12 },
    // Section results
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: 20,
      paddingBottom: 8,
    },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3 },
    sectionCount: { fontSize: 12, color: colors.textDim },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: spacing.lg,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
    rowSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
    typeIcon: {
      width: 40, height: 40, borderRadius: radius.sm,
      backgroundColor: colors.bgHover,
      justifyContent: 'center', alignItems: 'center',
      borderWidth: 1, borderColor: colors.borderSubtle,
    },
  });
}
