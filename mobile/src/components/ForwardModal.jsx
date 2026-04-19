import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Modal, FlatList, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import api from '../api/client';
import Avatar from './Avatar';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

function formatEventDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function EventPreview({ event }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.preview}>
      <View style={styles.previewHeader}>
        <Text style={styles.previewIcon}>📅</Text>
        <Text style={styles.previewLabel}>Event</Text>
      </View>
      <Text style={styles.previewTitle}>{event.title}</Text>
      <Text style={styles.previewMeta}>
        {formatEventDate(event.event_date)}{event.event_time ? `  🕐 ${event.event_time}` : ''}
      </Text>
      {event.location ? <Text style={styles.previewMeta}>📍 {event.location}</Text> : null}
      <Text style={styles.previewBy}>by @{event.username}</Text>
    </View>
  );
}

function ClubPreview({ club }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.preview}>
      <View style={styles.previewHeader}>
        <Text style={styles.previewIcon}>⚡</Text>
        <Text style={styles.previewLabel}>Club</Text>
      </View>
      <Text style={styles.previewTitle}>{club.name}</Text>
      <Text style={styles.previewMeta}>{club.member_count} members · {club.frequency}</Text>
      {club.description ? <Text style={styles.previewMeta} numberOfLines={2}>{club.description}</Text> : null}
    </View>
  );
}

export default function ForwardModal({ visible, onClose, type, item }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [recentConvos, setRecentConvos] = useState([]);
  const timeout = useRef(null);

  React.useEffect(() => {
    if (visible) {
      api.get('/dm/conversations').then(r => setRecentConvos(r.data.slice(0, 5))).catch(() => {});
    }
  }, [visible]);

  const reset = () => {
    setQuery(''); setResults([]); setSelectedUser(null);
    setMessage(''); setSending(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const search = (text) => {
    setQuery(text);
    clearTimeout(timeout.current);
    if (!text.trim()) { setResults([]); return; }
    setSearching(true);
    timeout.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/users/search?q=${encodeURIComponent(text)}`);
        setResults(data);
      } finally { setSearching(false); }
    }, 350);
  };

  const send = async () => {
    if (!selectedUser || sending) return;
    setSending(true);
    try {
      const { data: conv } = await api.post('/dm/conversations', { user_id: selectedUser.id });
      const body = { content: message.trim() };
      if (type === 'event') body.event_id = item.id;
      if (type === 'club')  body.club_id  = item.id;
      await api.post(`/dm/conversations/${conv.id}/messages`, body);
      reset();
      onClose();
      navigation.navigate('Conversation', { conversationId: conv.id, other: selectedUser });
    } catch {
      Alert.alert('Error', 'Could not forward');
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose}>
              <Text style={{ color: colors.textMuted, fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Forward {type === 'event' ? 'Event' : 'Club'}</Text>
            <TouchableOpacity onPress={send} disabled={!selectedUser || sending}>
              <Text style={{ color: selectedUser ? colors.accent : colors.textDim, fontSize: 15, fontWeight: '700' }}>
                {sending ? 'Sending…' : 'Send'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Recipient */}
          {selectedUser ? (
            <View style={styles.recipientRow}>
              <Text style={styles.toLabel}>To:</Text>
              <Avatar user={selectedUser} size="xs" />
              <Text style={styles.recipientName}>{selectedUser.display_name}</Text>
              <TouchableOpacity onPress={() => setSelectedUser(null)} hitSlop={10}>
                <Text style={{ color: colors.textMuted, fontSize: 18, lineHeight: 20 }}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.searchWrap}>
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={search}
                placeholder="Search people…"
                placeholderTextColor={colors.textDim}
                autoFocus
                autoCapitalize="none"
              />
              {searching && <ActivityIndicator color={colors.accent} size="small" style={{ marginRight: 10 }} />}
            </View>
          )}

          {/* Message + preview after recipient selected */}
          {selectedUser && (
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
              <TextInput
                style={styles.messageInput}
                value={message}
                onChangeText={setMessage}
                placeholder="Add a message…"
                placeholderTextColor={colors.textDim}
                multiline
                maxLength={500}
                autoFocus
              />
              {type === 'event' && item && <EventPreview event={item} />}
              {type === 'club'  && item && <ClubPreview  club={item}  />}
            </ScrollView>
          )}

          {/* Search results / recents */}
          {!selectedUser && (
            <FlatList
              data={results.length > 0 || query.trim() ? results : recentConvos.map(c => c.other).filter(Boolean)}
              keyExtractor={item => item?.id}
              contentContainerStyle={{ padding: spacing.md, gap: 4 }}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                !query.trim() && recentConvos.length > 0
                  ? <Text style={styles.sectionLabel}>Recent</Text>
                  : null
              }
              renderItem={({ item }) => item ? (
                <TouchableOpacity style={styles.userRow} onPress={() => setSelectedUser(item)} activeOpacity={0.8}>
                  <Avatar user={item} size="sm" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{item.display_name}</Text>
                    <Text style={styles.userHandle}>@{item.username}</Text>
                  </View>
                  <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>Select</Text>
                </TouchableOpacity>
              ) : null}
              ListEmptyComponent={query.trim() && !searching ? <Text style={styles.noResults}>No results</Text> : null}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.lg, paddingVertical: 16,
      borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
    },
    title: { fontSize: 16, fontWeight: '700', color: colors.text },
    recipientRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: spacing.lg, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
    },
    toLabel: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
    recipientName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
    searchWrap: {
      flexDirection: 'row', alignItems: 'center',
      borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
    },
    searchInput: {
      flex: 1, color: colors.text, fontSize: 15,
      paddingHorizontal: spacing.lg, paddingVertical: 14,
    },
    messageInput: {
      color: colors.text, fontSize: 15, minHeight: 60,
      paddingHorizontal: spacing.lg, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
    },
    preview: {
      marginHorizontal: spacing.lg, marginTop: 12,
      borderLeftWidth: 3, borderLeftColor: colors.accent,
      backgroundColor: colors.bgHover, borderRadius: radius.md,
      padding: 12, gap: 4,
    },
    previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    previewIcon: { fontSize: 14 },
    previewLabel: { fontSize: 11, fontWeight: '700', color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
    previewTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
    previewMeta: { fontSize: 12, color: colors.textMuted },
    previewBy: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4 },
    userName: { fontSize: 14, fontWeight: '600', color: colors.text },
    userHandle: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
    noResults: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 20 },
  });
}
