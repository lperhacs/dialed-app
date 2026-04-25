import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, ScrollView, Alert, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

function formatDate(d) {
  if (!d) return '∞';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ClubCard({ club, onUpdate, onDelete }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [memberStatus, setMemberStatus] = useState(club.memberStatus);
  const [memberCount, setMemberCount] = useState(club.member_count);

  const days = club.end_date
    ? Math.ceil((new Date(club.end_date) - Date.now()) / 86400000)
    : null;

  const isPrivate = club.visibility === 'private';

  const handleJoinPress = async () => {
    if (memberStatus === 'active') {
      setLoading(true);
      try {
        await api.delete(`/clubs/${club.id}/leave`);
        const newCount = Math.max(0, memberCount - 1);
        setMemberStatus(null);
        setMemberCount(newCount);
        onUpdate?.(club.id, null);
        if (newCount === 0) {
          await api.delete(`/clubs/${club.id}`).catch(() => {});
          onDelete?.(club.id);
        }
      } catch (err) {
        Alert.alert('Error', err.response?.data?.error || 'Failed');
      } finally {
        setLoading(false);
      }
    } else if (memberStatus === 'pending') {
      Alert.alert('Request Pending', 'Your request to join is awaiting approval from the creator.');
    } else {
      setLoading(true);
      try {
        const { data } = await api.post(`/clubs/${club.id}/join`);
        setMemberStatus(data.memberStatus);
        if (data.memberStatus === 'active') setMemberCount(c => c + 1);
        onUpdate?.(club.id, data.memberStatus);
      } catch (err) {
        Alert.alert('Error', err.response?.data?.error || 'Failed');
      } finally {
        setLoading(false);
      }
    }
  };

  const joinLabel = () => {
    if (loading) return '…';
    if (memberStatus === 'active') return 'Leave';
    if (memberStatus === 'pending') return 'Pending';
    return isPrivate ? 'Request' : 'Join';
  };

  const joinStyle = () => {
    if (memberStatus === 'active') return [styles.joinBtn, styles.joinBtnOutline];
    if (memberStatus === 'pending') return [styles.joinBtn, styles.joinBtnPending];
    return [styles.joinBtn];
  };

  const joinTextStyle = () => {
    if (memberStatus === 'active' || memberStatus === 'pending') return [styles.joinBtnText, { color: colors.text }];
    return [styles.joinBtnText];
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('ClubDetail', { id: club.id })}
      activeOpacity={0.8}
    >
      <View style={styles.cardTop}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.cardName}>{club.name}</Text>
            {isPrivate && <View style={styles.privatePill}><Text style={styles.privatePillText}>Private</Text></View>}
          </View>
          <Text style={styles.cardMeta}>
            @{club.username} · {club.frequency} ·{' '}
            {days !== null ? (days > 0 ? `${days}d left` : 'Ended') : 'Ongoing'}
          </Text>
        </View>
        <TouchableOpacity
          style={joinStyle()}
          onPress={handleJoinPress}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text style={joinTextStyle()}>{joinLabel()}</Text>
        </TouchableOpacity>
      </View>
      {!!club.description && <Text style={styles.cardDesc} numberOfLines={2}>{club.description}</Text>}
      <View style={styles.cardFooter}>
        <Text style={styles.cardStat}>{memberCount} members</Text>
        <Text style={styles.cardStat}>{formatDate(club.start_date)} → {formatDate(club.end_date)}</Text>
        {memberStatus === 'active' && <Text style={{ color: colors.green, fontSize: 12, fontWeight: '600' }}>✓ Joined</Text>}
        {memberStatus === 'pending' && <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>⏳ Pending</Text>}
      </View>
    </TouchableOpacity>
  );
}

function CreateModal({ visible, onClose, onCreated }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [form, setForm] = useState({
    name: '', description: '', frequency: 'daily',
    start_date: new Date().toISOString().split('T')[0], end_date: '',
    visibility: 'public',
  });
  const [saving, setSaving] = useState(false);
  const set = f => v => setForm(p => ({ ...p, [f]: v }));

  const handleCreate = async () => {
    if (!form.name.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/clubs', form);
      onCreated(data);
      onClose();
      setForm({ name: '', description: '', frequency: 'daily', start_date: new Date().toISOString().split('T')[0], end_date: '', visibility: 'public' });
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}><Text style={{ color: colors.textMuted, fontSize: 15 }}>Cancel</Text></TouchableOpacity>
          <Text style={styles.modalTitle}>Create Club</Text>
          <TouchableOpacity onPress={handleCreate} disabled={saving}>
            <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '700' }}>{saving ? 'Creating…' : 'Create'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 16 }} keyboardShouldPersistTaps="handled">
          {[
            { f: 'name', label: 'CLUB NAME', placeholder: 'Morning Run Club' },
            { f: 'description', label: 'DESCRIPTION', placeholder: 'What is this club about?', multi: true },
            { f: 'start_date', label: 'START DATE', placeholder: 'YYYY-MM-DD' },
            { f: 'end_date', label: 'END DATE (optional)', placeholder: 'YYYY-MM-DD' },
          ].map(({ f, label, placeholder, multi }) => (
            <View key={f} style={{ gap: 5 }}>
              <Text style={styles.fieldLabel}>{label}</Text>
              <TextInput
                style={[styles.input, multi && { minHeight: 60, textAlignVertical: 'top' }]}
                value={form[f]}
                onChangeText={set(f)}
                placeholder={placeholder}
                placeholderTextColor={colors.textDim}
                multiline={multi}
                autoCapitalize="none"
              />
            </View>
          ))}

          <View style={{ gap: 5 }}>
            <Text style={styles.fieldLabel}>FREQUENCY</Text>
            <View style={styles.segRow}>
              {['daily', 'weekly', 'monthly'].map(fq => (
                <TouchableOpacity
                  key={fq}
                  style={[styles.seg, form.frequency === fq && styles.segActive]}
                  onPress={() => set('frequency')(fq)}
                >
                  <Text style={[styles.segText, form.frequency === fq && styles.segTextActive]}>
                    {fq.charAt(0).toUpperCase() + fq.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ gap: 5 }}>
            <Text style={styles.fieldLabel}>VISIBILITY</Text>
            <View style={styles.segRow}>
              {[
                { value: 'public', label: 'Public' },
                { value: 'private', label: 'Private' },
              ].map(({ value, label }) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.seg, form.visibility === value && styles.segActive]}
                  onPress={() => set('visibility')(value)}
                >
                  <Text style={[styles.segText, form.visibility === value && styles.segTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.visibilityHint}>
              {form.visibility === 'private'
                ? 'Members must request to join. You approve or deny each request.'
                : 'Anyone can join immediately.'}
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function SuggestedCard({ club }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const [status, setStatus] = useState(club.memberStatus);
  const [joining, setJoining] = useState(false);
  const isPrivate = club.visibility === 'private';

  const handleJoin = async () => {
    if (status === 'active' || status === 'pending') return;
    setJoining(true);
    try {
      const { data } = await api.post(`/clubs/${club.id}/join`);
      setStatus(data.memberStatus);
    } catch {
      Alert.alert('Error', 'Could not join club');
    } finally {
      setJoining(false);
    }
  };

  const joinLabel = () => {
    if (joining) return '…';
    if (status === 'active') return '✓ Joined';
    if (status === 'pending') return 'Pending';
    return isPrivate ? 'Request' : 'Join';
  };

  return (
    <TouchableOpacity
      style={styles.sugCard}
      onPress={() => navigation.navigate('ClubDetail', { id: club.id })}
      activeOpacity={0.8}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.sugName} numberOfLines={2}>{club.name}</Text>
        <Text style={styles.sugMeta}>{club.frequency} · {club.member_count} members</Text>
        {!!club.description && (
          <Text style={styles.sugDesc} numberOfLines={2}>{club.description}</Text>
        )}
      </View>
      <TouchableOpacity
        style={[styles.sugJoinBtn, (status === 'active') && styles.sugJoinBtnJoined, (status === 'pending') && styles.sugJoinBtnPending]}
        onPress={handleJoin}
        disabled={joining || status === 'active' || status === 'pending'}
        activeOpacity={0.8}
      >
        <Text style={[styles.sugJoinText, (status === 'active' || status === 'pending') && { color: colors.textMuted }]}>
          {joinLabel()}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function SuggestedSection({ suggestions }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <View style={styles.sugSection}>
      <View style={styles.sugHeader}>
        <Ionicons name="sparkles" size={14} color={colors.accent} />
        <Text style={styles.sugTitle}>Suggested for you</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sugScroll}>
        {suggestions.map(c => <SuggestedCard key={c.id} club={c} />)}
      </ScrollView>
    </View>
  );
}

export default function ClubsScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [clubs, setClubs] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const searchTimeout = React.useRef(null);

  const load = useCallback(async () => {
    const [clubsRes, sugRes] = await Promise.allSettled([
      api.get('/clubs'),
      api.get('/clubs/suggested'),
    ]);
    if (clubsRes.status === 'fulfilled') setClubs(clubsRes.value.data);
    if (sugRes.status === 'fulfilled') setSuggestions(sugRes.value.data);
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    return () => clearTimeout(searchTimeout.current);
  }, []));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleSearch = (text) => {
    setQuery(text);
    clearTimeout(searchTimeout.current);
    if (!text.trim()) { setSearchResults(null); return; }
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/clubs/search?q=${encodeURIComponent(text.trim())}`);
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const displayList = searchResults !== null ? searchResults : clubs;
  const isSearching = query.trim().length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Clubs</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
          <Text style={styles.addBtnText}>+ Create</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={handleSearch}
          placeholder="Search clubs…"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        {searching && <ActivityIndicator color={colors.accent} size="small" style={{ marginRight: 10 }} />}
      </View>

      {loading && !isSearching ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>
      ) : (
        <FlatList
          data={displayList}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ClubCard
              club={item}
              onDelete={id => setClubs(prev => prev.filter(c => c.id !== id))}
            />
          )}
          ListHeaderComponent={!isSearching && suggestions.length > 0 ? <SuggestedSection suggestions={suggestions} /> : null}
          contentContainerStyle={{ padding: spacing.lg, gap: 12, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={!isSearching ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} /> : undefined}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{isSearching ? 'No results' : 'No clubs yet'}</Text>
              {!isSearching && (
                <>
                  <Text style={styles.emptyText}>Create the first club and invite friends to join!</Text>
                  <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowCreate(true)}>
                    <Text style={styles.emptyBtnText}>Create a Club</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          }
        />
      )}

      <CreateModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={c => setClubs(p => [c, ...p])}
      />
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  headerRight: { flexDirection: 'row', gap: 8 },
  lbBtn: { backgroundColor: colors.bgHover, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: colors.borderSubtle },
  lbBtnText: { color: colors.text, fontWeight: '500', fontSize: 13 },
  addBtn: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnText: { color: colors.bg, fontWeight: '600', fontSize: 13 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginVertical: 10,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  privatePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.xs, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.bgHover },
  privatePillText: { fontSize: 10, fontWeight: '500', color: colors.textMuted },
  card: {
    backgroundColor: colors.bgCard, borderRadius: radius.md,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.borderSubtle,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  cardName: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 3 },
  cardMeta: { fontSize: 12, color: colors.textMuted },
  cardDesc: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: 10 },
  cardFooter: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  cardStat: { fontSize: 12, color: colors.textDim },
  joinBtn: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 7, alignSelf: 'flex-start' },
  joinBtnOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  joinBtnPending: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.textDim },
  joinBtnText: { color: colors.bg, fontSize: 13, fontWeight: '600' },
  modalContainer: { flex: 1, backgroundColor: colors.bg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  modalTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  input: { backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text, fontSize: 15, paddingHorizontal: 14, paddingVertical: 11 },
  segRow: { flexDirection: 'row', gap: 6 },
  seg: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, backgroundColor: colors.bgHover, borderWidth: 1, borderColor: colors.borderSubtle, alignItems: 'center' },
  segActive: { backgroundColor: colors.accentDim, borderColor: colors.accent },
  segText: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  segTextActive: { color: colors.accent, fontWeight: '600' },
  visibilityHint: { fontSize: 12, color: colors.textDim, lineHeight: 16 },
  // Suggested section
  sugSection: { marginBottom: 20, marginHorizontal: -spacing.lg },
  sugHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, marginBottom: 10 },
  sugTitle: { fontSize: 11, fontWeight: '500', color: colors.textMuted },
  sugScroll: { paddingHorizontal: spacing.lg, gap: 10 },
  sugCard: {
    width: 180,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 12,
    gap: 8,
  },
  sugName: { fontSize: 14, fontWeight: '600', color: colors.text, lineHeight: 18 },
  sugMeta: { fontSize: 11, color: colors.textMuted },
  sugDesc: { fontSize: 12, color: colors.textMuted, lineHeight: 16 },
  sugJoinBtn: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' },
  sugJoinBtnJoined: { backgroundColor: colors.bgHover },
  sugJoinBtnPending: { backgroundColor: colors.bgHover },
  sugJoinText: { color: colors.bg, fontSize: 12, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 6 },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  emptyBtn: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: 20, paddingVertical: 11 },
  emptyBtnText: { color: colors.bg, fontWeight: '600', fontSize: 14 },
  });
}
