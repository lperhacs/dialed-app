import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import MentionSuggestions from '../components/MentionSuggestions';
import useMentionInput from '../hooks/useMentionInput';
import { API_BASE_URL, radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { timeAgo } from '../utils/timeAgo';

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

import { timeAgo } from '../utils/timeAgo';

function CommentLikeBtn({ comment, postId }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [liked, setLiked] = useState(!!comment.liked_by_me);
  const [likeCount, setLikeCount] = useState(comment.like_count || 0);

  const toggle = async () => {
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount(c => wasLiked ? c - 1 : c + 1);
    try {
      if (wasLiked) {
        const { data } = await api.delete(`/posts/${postId}/comments/${comment.id}/like`);
        setLikeCount(data.like_count);
      } else {
        const { data } = await api.post(`/posts/${postId}/comments/${comment.id}/like`);
        setLikeCount(data.like_count);
      }
    } catch {
      setLiked(wasLiked);
      setLikeCount(c => wasLiked ? c + 1 : c - 1);
    }
  };

  return (
    <TouchableOpacity onPress={toggle} style={styles.likeBtn} activeOpacity={0.7} hitSlop={8}>
      <Text style={[styles.likeIcon, liked && { color: colors.accent }]}>{liked ? '🧡' : '🤍'}</Text>
      {likeCount > 0 && <Text style={[styles.likeCount, liked && { color: colors.accent }]}>{likeCount}</Text>}
    </TouchableOpacity>
  );
}

function CommentItem({ comment, postId, currentUserId, onDelete, onReply }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  // navigation and colors are available here for renderMentions
  return (
    <View style={styles.commentWrap}>
      <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { username: comment.username })}>
        <Avatar user={comment} size="sm" />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <View style={styles.bubble}>
          <View style={styles.bubbleHeader}>
            <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { username: comment.username })}>
              <Text style={styles.commenterName}>{comment.display_name}</Text>
            </TouchableOpacity>
            <Text style={styles.commentTime}>{timeAgo(comment.created_at)}</Text>
            {currentUserId === comment.user_id && (
              <TouchableOpacity onPress={() => onDelete(comment.id)} style={{ marginLeft: 'auto' }}>
                <Text style={{ color: colors.textDim, fontSize: 12 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.commentText}>{renderMentions(comment.content, colors, navigation)}</Text>
        </View>
        <View style={styles.commentActions}>
          <TouchableOpacity onPress={() => onReply(comment)}>
            <Text style={styles.replyBtn}>Reply</Text>
          </TouchableOpacity>
          <CommentLikeBtn comment={comment} postId={postId} />
        </View>

        {/* Replies */}
        {comment.replies?.map(r => (
          <View key={r.id} style={styles.replyWrap}>
            <Avatar user={r} size="xs" />
            <View style={[styles.bubble, { flex: 1 }]}>
              <View style={styles.bubbleHeader}>
                <Text style={styles.commenterName}>{r.display_name}</Text>
                <Text style={styles.commentTime}>{timeAgo(r.created_at)}</Text>
              </View>
              <Text style={styles.commentText}>{renderMentions(r.content, colors, navigation)}</Text>
              <View style={[styles.commentActions, { marginTop: 6 }]}>
                <CommentLikeBtn comment={r} postId={postId} />
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function CommentsScreen({ route }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { postId, post: postParam } = route.params;
  const navigation = useNavigation();
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const { suggestions: mentionSuggestions, onChangeText: onMentionChangeText, pickMention } = useMentionInput(text, setText);
  const [replyTo, setReplyTo] = useState(null); // { id, display_name }
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    api.get(`/posts/${postId}/comments`)
      .then(r => setComments(r.data))
      .finally(() => setLoading(false));
  }, [postId]);

  const submit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const { data } = await api.post(`/posts/${postId}/comments`, {
        content: text.trim(),
        parent_id: replyTo?.id || null,
      });
      if (replyTo) {
        setComments(cs => cs.map(c =>
          c.id === replyTo.id ? { ...c, replies: [...(c.replies || []), data] } : c
        ));
      } else {
        setComments(cs => [...cs, { ...data, replies: [], like_count: 0, liked_by_me: false }]);
      }
      setText('');
      setReplyTo(null);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = (id) => {
    Alert.alert('Delete comment?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await api.delete(`/posts/${postId}/comments/${id}`);
          setComments(cs => cs.filter(c => c.id !== id));
        },
      },
    ]);
  };

  const handleReply = (comment) => {
    setReplyTo(comment);
    inputRef.current?.focus();
  };

  const PostHeader = postParam ? (
    <View style={styles.postHeader}>
      <View style={styles.postHeaderUser}>
        <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { username: postParam.username })}>
          <Avatar user={{ username: postParam.username, display_name: postParam.display_name, avatar_url: postParam.avatar_url }} size="md" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { username: postParam.username })}>
            <Text style={styles.postHeaderName}>{postParam.display_name}</Text>
          </TouchableOpacity>
          <Text style={styles.postHeaderHandle}>@{postParam.username}</Text>
        </View>
      </View>
      {postParam.habit_name && (
        <View style={[styles.postHabitTag, { backgroundColor: `${postParam.habit_color || colors.accent}18`, borderColor: postParam.habit_color || colors.accent }]}>
          <Text style={[styles.postHabitTagText, { color: postParam.habit_color || colors.accent }]}>
            Day {postParam.habit_day} · {postParam.habit_name}
          </Text>
        </View>
      )}
      {!!postParam.content && (
        <Text style={styles.postContent}>
          {renderMentions(postParam.content, colors, navigation)}
        </Text>
      )}
      {!!postParam.image_url && (
        <Image
          source={{ uri: postParam.image_url.startsWith('http') ? postParam.image_url : `${API_BASE_URL}${postParam.image_url}` }}
          style={styles.postImage}
          resizeMode="cover"
        />
      )}
      <View style={styles.postDivider} />
      <Text style={styles.commentsLabel}>Comments</Text>
    </View>
  ) : null;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <FlatList
          data={comments}
          keyExtractor={item => item.id}
          ListHeaderComponent={PostHeader}
          renderItem={({ item }) => (
            <CommentItem
              comment={item}
              postId={postId}
              currentUserId={user?.id}
              onDelete={deleteComment}
              onReply={handleReply}
            />
          )}
          contentContainerStyle={{ padding: spacing.md, gap: 12, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No comments yet. Be the first!</Text>
            </View>
          }
        />
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
        <MentionSuggestions suggestions={mentionSuggestions} onSelect={pickMention} />
        {replyTo && (
          <View style={styles.replyBanner}>
            <Text style={styles.replyBannerText}>Replying to {replyTo.display_name}</Text>
            <TouchableOpacity onPress={() => setReplyTo(null)}>
              <Text style={{ color: colors.textMuted }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputRow}>
          <Avatar user={user} size="sm" />
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={text}
            onChangeText={onMentionChangeText}
            placeholder={replyTo ? `Reply to ${replyTo.display_name}…` : 'Add a comment…'}
            placeholderTextColor={colors.textDim}
            returnKeyType="send"
            onSubmitEditing={submit}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            onPress={submit}
            disabled={submitting || !text.trim()}
            style={[styles.sendBtn, (!text.trim() || submitting) && styles.sendBtnDisabled]}
            activeOpacity={0.85}
          >
            <Text style={styles.sendBtnText}>{submitting ? '…' : 'Post'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  commentWrap: { flexDirection: 'row', gap: 10 },
  bubble: { backgroundColor: colors.bgHover, borderRadius: radius.sm, padding: 10, flex: 1 },
  bubbleHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  commenterName: { fontSize: 13, fontWeight: '700', color: colors.text },
  commentTime: { fontSize: 11, color: colors.textDim },
  commentText: { fontSize: 14, color: colors.text, lineHeight: 19 },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, marginLeft: 4 },
  replyBtn: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  likeIcon: { fontSize: 13, color: colors.textMuted },
  likeCount: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  replyWrap: { flexDirection: 'row', gap: 8, marginTop: 8, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: colors.borderSubtle },
  // Input bar
  inputBar: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    backgroundColor: colors.bgCard,
  },
  replyBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  replyBannerText: { fontSize: 12, color: colors.accent, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    backgroundColor: colors.bgInput,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    color: colors.text,
    fontSize: 14,
  },
  sendBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  // Post header styles
  postHeader: { marginBottom: 8 },
  postHeaderUser: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  postHeaderName: { fontSize: 14, fontWeight: '700', color: colors.text },
  postHeaderHandle: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  postHabitTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
    borderWidth: 1,
    marginBottom: 8,
  },
  postHabitTagText: { fontSize: 11, fontWeight: '500' },
  postContent: { fontSize: 15, lineHeight: 22, color: colors.text, marginBottom: 10 },
  postImage: { width: '100%', height: 220, borderRadius: radius.sm, marginBottom: 10, backgroundColor: colors.bgHover },
  postDivider: { height: 1, backgroundColor: colors.borderSubtle, marginVertical: 12 },
  commentsLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginBottom: 4 },
  });
}
