import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Alert, Modal, TextInput, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { API_BASE_URL, radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';
import api from '../api/client';

import { timeAgo } from '../utils/timeAgo';

function fullUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${API_BASE_URL}${path}`;
}

function ShareModal({ visible, onClose, postId, post }) {
  const { colors } = useTheme();
  const shareStyles = makeShareStyles(colors);
  const navigation = useNavigation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [recentConvos, setRecentConvos] = useState([]);
  const timeout = React.useRef(null);

  React.useEffect(() => {
    if (visible) {
      api.get('/dm/inbox').then(r => setRecentConvos(r.data.slice(0, 5))).catch(() => {});
    }
  }, [visible]);

  const reset = () => {
    setQuery('');
    setResults([]);
    setSelectedUser(null);
    setMessage('');
    setSending(false);
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
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const selectUser = (u) => {
    setSelectedUser(u);
    setQuery('');
    setResults([]);
  };

  const send = async () => {
    if (!selectedUser || sending) return;
    setSending(true);
    try {
      const { data: conv } = await api.post('/dm/conversations', { user_id: selectedUser.id });
      await api.post(`/dm/conversations/${conv.id}/messages`, { post_id: postId, content: message.trim() });
      reset();
      onClose();
      navigation.navigate('Conversation', { conversationId: conv.id, other: selectedUser });
    } catch {
      Alert.alert('Error', 'Could not send post');
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={shareStyles.container}>
          <View style={shareStyles.header}>
            <TouchableOpacity onPress={handleClose}>
              <Text style={{ color: colors.textMuted, fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={shareStyles.title}>Send Post</Text>
            <TouchableOpacity onPress={send} disabled={!selectedUser || sending}>
              <Text style={{ color: selectedUser ? colors.accent : colors.textDim, fontSize: 15, fontWeight: '700' }}>
                {sending ? 'Sending…' : 'Send'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Recipient row */}
          {selectedUser ? (
            <View style={shareStyles.recipientRow}>
              <Text style={shareStyles.toLabel}>To:</Text>
              <Avatar user={selectedUser} size="xs" />
              <Text style={shareStyles.recipientName}>{selectedUser.display_name}</Text>
              <TouchableOpacity onPress={() => setSelectedUser(null)} hitSlop={10}>
                <Text style={{ color: colors.textMuted, fontSize: 18, lineHeight: 20 }}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={shareStyles.searchWrap}>
              <TextInput
                style={shareStyles.searchInput}
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

          {/* Message input + post preview - shown after recipient selected */}
          {selectedUser && (
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
              <View style={shareStyles.messageWrap}>
                <TextInput
                  style={shareStyles.messageInput}
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Add a message…"
                  placeholderTextColor={colors.textDim}
                  multiline
                  maxLength={500}
                  autoFocus
                />
              </View>

              {/* Post preview */}
              <View style={shareStyles.postPreview}>
                <View style={shareStyles.postPreviewHeader}>
                  <Avatar user={{ username: post.username, display_name: post.display_name, avatar_url: post.avatar_url }} size="xs" />
                  <Text style={shareStyles.postPreviewName}>{post.display_name}</Text>
                  <Text style={shareStyles.postPreviewHandle}>@{post.username}</Text>
                </View>
                {!!post.content && (
                  <Text style={shareStyles.postPreviewContent} numberOfLines={4}>{post.content}</Text>
                )}
                {post.habit_name && (
                  <View style={[shareStyles.postPreviewTag, { borderColor: post.habit_color || colors.accent }]}>
                    <Text style={[shareStyles.postPreviewTagText, { color: post.habit_color || colors.accent }]}>
                      Day {Math.max(1, post.habit_day || 1)} · {post.habit_name}
                    </Text>
                  </View>
                )}
                {!!post.image_url && (
                  <Image
                    source={{ uri: fullUrl(post.image_url) }}
                    style={shareStyles.postPreviewImage}
                    resizeMode="cover"
                  />
                )}
              </View>
            </ScrollView>
          )}

          {/* Search results / recent convos - shown while searching */}
          {!selectedUser && (
            <FlatList
              data={results.length > 0 || query.trim() ? results : recentConvos.map(c => c.other)}
              keyExtractor={item => item?.id}
              contentContainerStyle={{ padding: spacing.md, gap: 4 }}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                !query.trim() && recentConvos.length > 0 ? (
                  <Text style={shareStyles.sectionLabel}>Recent</Text>
                ) : null
              }
              renderItem={({ item }) => item ? (
                <TouchableOpacity style={shareStyles.userRow} onPress={() => selectUser(item)} activeOpacity={0.8}>
                  <Avatar user={item} size="sm" />
                  <View style={{ flex: 1 }}>
                    <Text style={shareStyles.userName}>{item.display_name}</Text>
                    <Text style={shareStyles.userHandle}>@{item.username}</Text>
                  </View>
                  <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>Select</Text>
                </TouchableOpacity>
              ) : null}
              ListEmptyComponent={
                query.trim() ? (
                  !searching && <Text style={shareStyles.noResults}>No results</Text>
                ) : null
              }
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function renderMentions(text, colors, navigation) {
  const parts = text.split(/(@[\w]+)/g);
  return parts.map((part, i) => {
    if (/^@[\w]+$/.test(part)) {
      const username = part.slice(1);
      return (
        <Text
          key={i}
          style={{ color: colors.accent, fontWeight: '600' }}
          onPress={() => navigation.navigate('UserProfile', { username })}
        >
          {part}
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
}

export default function PostCard({ post, onDelete }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { user } = useAuth();
  const navigation = useNavigation();
  const [cheered, setCheered] = useState(!!post.cheered_by_me);
  const [cheerCount, setCheerCount] = useState(post.cheer_count || 0);
  const [showShare, setShowShare] = useState(false);

  const toggleCheer = async () => {
    const was = cheered;
    setCheered(!was);
    setCheerCount(c => was ? c - 1 : c + 1);
    try {
      if (was) {
        const { data } = await api.delete(`/posts/${post.id}/cheer`);
        setCheerCount(data.cheer_count);
      } else {
        const { data } = await api.post(`/posts/${post.id}/cheer`);
        setCheerCount(data.cheer_count);
      }
    } catch {
      setCheered(was);
      setCheerCount(c => was ? c + 1 : c - 1);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try { await api.delete(`/posts/${post.id}`); onDelete?.(post.id); }
          catch { Alert.alert('Error', 'Could not delete post'); }
        },
      },
    ]);
  };

  const goToProfile = () => {
    navigation.navigate('UserProfile', { username: post.username });
  };

  const goToComments = () => {
    navigation.navigate('Comments', { postId: post.id, post });
  };

  const imageUrl = fullUrl(post.image_url);
  const isOwn = user?.id === post.user_id;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goToProfile}>
          <Avatar user={{ username: post.username, display_name: post.display_name, avatar_url: post.avatar_url }} size="md" />
        </TouchableOpacity>
        <View style={styles.userInfo}>
          <TouchableOpacity onPress={goToProfile}>
            <Text style={styles.displayName}>{post.display_name}</Text>
          </TouchableOpacity>
          <Text style={styles.username}>@{post.username} · {timeAgo(post.created_at)}</Text>
        </View>
        {isOwn && (
          <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn} hitSlop={12}>
            <Ionicons name="trash-outline" size={16} color={colors.textDim} />
          </TouchableOpacity>
        )}
      </View>

      {/* Habit tag */}
      {post.habit_name && (
        <View style={[
          styles.habitTag,
          { backgroundColor: `${post.habit_color || colors.accent}18`, borderColor: post.habit_color || colors.accent },
        ]}>
          <Text style={[styles.habitTagText, { color: post.habit_color || colors.accent }]}>
            Day {Math.max(1, post.habit_day || 1)} · {post.habit_name}
          </Text>
        </View>
      )}

      {/* Content + Image - tappable to open post detail */}
      <TouchableOpacity onPress={goToComments} activeOpacity={0.85}>
        {!!post.content && (
          <Text style={styles.content}>
            {renderMentions(post.content, colors, navigation)}
          </Text>
        )}
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : null}
      </TouchableOpacity>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, cheered && styles.actionBtnCheered]}
          onPress={toggleCheer}
          activeOpacity={0.7}
        >
          <Ionicons name={cheered ? 'rocket' : 'rocket-outline'} size={15} color={cheered ? colors.accent : colors.textMuted} />
          {cheerCount > 0 && <Text style={[styles.actionText, cheered && { color: colors.accent }]}>{cheerCount}</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, post.comment_count > 0 && styles.actionBtnCommented]} onPress={goToComments} activeOpacity={0.7}>
          <Ionicons name="chatbubble-outline" size={15} color={post.comment_count > 0 ? colors.accent : colors.textMuted} />
          <Text style={[styles.actionText, post.comment_count > 0 && { color: colors.accent }]}>{post.comment_count || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={() => setShowShare(true)} activeOpacity={0.7}>
          <Ionicons name="paper-plane-outline" size={15} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ShareModal visible={showShare} onClose={() => setShowShare(false)} postId={post.id} post={post} />
    </View>
  );
}

function makeStyles(colors) { return StyleSheet.create({
  card: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  userInfo: { flex: 1 },
  displayName: { fontSize: 14, fontWeight: '600', color: colors.text },
  username: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  deleteBtn: { paddingLeft: 8 },
  habitTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
    borderWidth: 1,
    marginBottom: 8,
  },
  habitTagText: { fontSize: 11, fontWeight: '500' },
  content: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
    marginBottom: 10,
  },
  image: {
    width: '100%',
    height: 220,
    borderRadius: radius.sm,
    marginBottom: 10,
    backgroundColor: colors.bgHover,
  },
  actions: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 6,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.xs,
    backgroundColor: colors.bgHover,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  actionBtnCommented: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentDimBorder,
  },
  actionBtnCheered: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentDimBorder,
  },
  actionText: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
}); }

function makeShareStyles(colors) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    backgroundColor: colors.bgInput,
    borderRadius: 10,
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
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  toLabel: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  recipientName: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  messageWrap: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  messageInput: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  userName: { fontSize: 14, fontWeight: '700', color: colors.text },
  userHandle: { fontSize: 12, color: colors.textMuted },
  noResults: { fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingTop: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 4, paddingBottom: 8 },
  postPreview: {
    margin: 16,
    marginTop: 0,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgCard,
    padding: 12,
    gap: 8,
  },
  postPreviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  postPreviewName: { fontSize: 13, fontWeight: '700', color: colors.text },
  postPreviewHandle: { fontSize: 12, color: colors.textMuted },
  postPreviewContent: { fontSize: 14, color: colors.text, lineHeight: 20 },
  postPreviewTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  postPreviewTagText: { fontSize: 11, fontWeight: '600' },
  postPreviewImage: {
    width: '100%',
    height: 160,
    borderRadius: radius.sm,
    backgroundColor: colors.bgHover,
  },
}); }
