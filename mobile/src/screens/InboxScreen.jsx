import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, TextInput, Pressable, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import Avatar from '../components/Avatar';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

import { timeAgo } from '../utils/timeAgo';

function GroupIcon({ participants }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgHover, borderWidth: 1, borderColor: colors.borderSubtle, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="people-outline" size={20} color={colors.textMuted} />
    </View>
  );
}

function ConvRow({ conv }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const last = conv.last_message;
  const isGroup = conv.is_group;

  const navParams = isGroup
    ? { conversationId: conv.id, groupName: conv.name, isGroup: true, participantCount: conv.participant_count }
    : { conversationId: conv.id, other: conv.other };

  const displayName = isGroup ? conv.name : conv.other?.display_name;
  const subline = isGroup ? `${conv.participant_count} members` : null;

  const previewText = last
    ? last.post_id
      ? `${last.display_name} shared a post`
      : `${last.display_name}: ${last.content}`
    : 'No messages yet';

  return (
    <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Conversation', navParams)} activeOpacity={0.8}>
      {isGroup ? <GroupIcon participants={conv.participants} /> : <Avatar user={conv.other} size="md" />}
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={styles.name}>{displayName}</Text>
          {last && <Text style={styles.time}>{timeAgo(last.created_at)}</Text>}
        </View>
        {subline && <Text style={[styles.preview, { color: colors.accent, fontSize: 11, fontWeight: '600', marginBottom: 1 }]}>{subline}</Text>}
        <Text style={styles.preview} numberOfLines={1}>{previewText}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function InboxScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [convs, setConvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get('/dm/inbox');
    setConvs(data);
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().catch(() => {}).finally(() => setLoading(false));
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
  };

  const onSearchChange = async (text) => {
    setSearchQuery(text);
    if (text.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const { data } = await api.get(`/users/search?q=${encodeURIComponent(text)}`);
      setSearchResults(data);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const startConversation = async (user) => {
    setStarting(true);
    try {
      const { data } = await api.post('/dm/conversations', { user_id: user.id });
      setComposeOpen(false);
      setSearchQuery('');
      setSearchResults([]);
      navigation.navigate('Conversation', {
        conversationId: data.id,
        other: { id: user.id, username: user.username, display_name: user.display_name, avatar_url: user.avatar_url },
      });
    } catch {
      Alert.alert('Error', 'Could not start conversation');
    } finally {
      setStarting(false);
    }
  };

  const closeCompose = () => {
    setComposeOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity onPress={() => setComposeOpen(true)} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="create-outline" size={24} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>
      ) : (
        <FlatList
          data={convs}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <ConvRow conv={item} />}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          contentContainerStyle={convs.length === 0 ? { flex: 1 } : { paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySub}>Tap + to start a new conversation.</Text>
            </View>
          }
        />
      )}

      {/* New conversation compose modal */}
      <Modal visible={composeOpen} animationType="slide" presentationStyle="formSheet" onRequestClose={closeCompose}>
        <View style={styles.composeContainer}>
          <View style={styles.composeHeader}>
            <Text style={styles.composeTitle}>New Message</Text>
            <TouchableOpacity onPress={closeCompose} hitSlop={12}>
              <Text style={{ color: colors.textMuted, fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.composeSearch}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              autoFocus
              value={searchQuery}
              onChangeText={onSearchChange}
              placeholder="Search people..."
              placeholderTextColor={colors.textMuted}
              style={styles.composeInput}
            />
            {searching && <ActivityIndicator size="small" color={colors.textMuted} />}
          </View>
          <FlatList
            data={searchResults}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.userRow}
                onPress={() => startConversation(item)}
                disabled={starting}
                activeOpacity={0.75}
              >
                <Avatar user={item} size="md" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{item.display_name}</Text>
                  <Text style={styles.userHandle}>@{item.username}</Text>
                </View>
                {starting && <ActivityIndicator size="small" color={colors.accent} />}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              searchQuery.length >= 2 && !searching ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>No users found</Text>
                </View>
              ) : searchQuery.length < 2 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>Type to search for people</Text>
                </View>
              ) : null
            }
          />
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
  backBtn: { width: 36 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  time: { fontSize: 11, color: colors.textDim },
  preview: { fontSize: 13, color: colors.textMuted },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  composeContainer: { flex: 1, backgroundColor: colors.bg },
  composeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    paddingTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  composeTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  composeSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: spacing.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.bgHover,
    borderRadius: radius.md,
  },
  composeInput: { flex: 1, color: colors.text, fontSize: 15 },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  userName: { fontSize: 15, fontWeight: '700', color: colors.text },
  userHandle: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  });
}
