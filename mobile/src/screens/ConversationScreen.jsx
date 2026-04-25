import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Modal, Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import MentionSuggestions from '../components/MentionSuggestions';
import useMentionInput from '../hooks/useMentionInput';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useBadges } from '../context/BadgeContext';

import { timeAgo } from '../utils/timeAgo';

function SharedEventPreview({ event }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  if (!event) return null;
  return (
    <View style={styles.sharedEvent}>
      <Text style={styles.sharedLabel}>Event</Text>
      <Text style={styles.sharedTitle}>{event.title}</Text>
      <Text style={styles.sharedMeta}>
        {new Date(event.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        {event.event_time ? `  ${event.event_time}` : ''}
      </Text>
      {event.location ? <Text style={styles.sharedMeta}>{event.location}</Text> : null}
    </View>
  );
}

function SharedClubPreview({ club }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  if (!club) return null;
  return (
    <View style={styles.sharedEvent}>
      <Text style={styles.sharedLabel}>Club</Text>
      <Text style={styles.sharedTitle}>{club.name}</Text>
      <Text style={styles.sharedMeta}>{club.member_count} members · {club.frequency}</Text>
      {club.description ? <Text style={styles.sharedMeta} numberOfLines={2}>{club.description}</Text> : null}
    </View>
  );
}

function SharedPostPreview({ post }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  if (!post) return null;
  return (
    <TouchableOpacity
      style={styles.sharedPost}
      onPress={() => navigation.navigate('Comments', { postId: post.id })}
      activeOpacity={0.8}
    >
      <Text style={styles.sharedPostLabel}>Shared post</Text>
      <Text style={styles.sharedPostUser}>@{post.username}</Text>
      {!!post.content && <Text style={styles.sharedPostContent} numberOfLines={3}>{post.content}</Text>}
      {post.habit_name && (
        <Text style={[styles.sharedPostHabit, { color: post.habit_color || colors.accent }]}>
          Day {post.habit_day} · {post.habit_name}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const MUTE_OPTIONS = [
  { label: '1 hour', value: '1h' },
  { label: '3 hours', value: '3h' },
  { label: '5 hours', value: '5h' },
  { label: '24 hours', value: '1d' },
  { label: 'Forever', value: 'forever' },
];

function MuteModal({ visible, isMuted, onClose, onMute, onUnmute }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.muteOverlay} onPress={onClose}>
        <Pressable style={styles.muteSheet}>
          <View style={styles.muteHandle} />
          <Text style={styles.muteTitle}>Mute Notifications</Text>
          {MUTE_OPTIONS.map(opt => (
            <TouchableOpacity key={opt.value} style={styles.muteOption} onPress={() => { onMute(opt.value); onClose(); }} activeOpacity={0.7}>
              <Text style={styles.muteOptionText}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
          {isMuted && (
            <TouchableOpacity style={[styles.muteOption, styles.unmuteOption]} onPress={() => { onUnmute(); onClose(); }} activeOpacity={0.7}>
              <Ionicons name="notifications-outline" size={16} color={colors.accent} style={{ marginRight: 8 }} />
              <Text style={[styles.muteOptionText, { color: colors.accent }]}>Unmute</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.muteCancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.muteCancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MessageBubble({ msg, isMe, showSender }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
      {!isMe && <Avatar user={{ avatar_url: msg.avatar_url, display_name: msg.display_name }} size="xs" />}
      <View style={[styles.bubble, isMe && styles.bubbleMe]}>
        {!isMe && showSender && (
          <Text style={styles.bubbleSender}>{msg.display_name}</Text>
        )}
        {msg.shared_post  && <SharedPostPreview  post={msg.shared_post}   />}
        {msg.shared_event && <SharedEventPreview event={msg.shared_event} />}
        {msg.shared_club  && <SharedClubPreview  club={msg.shared_club}   />}
        {!!msg.content && (
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{msg.content}</Text>
        )}
        <Text style={[styles.bubbleTime, isMe && { color: colors.bg + '80' }]}>
          {timeAgo(msg.created_at)}
        </Text>
      </View>
    </View>
  );
}

export default function ConversationScreen({ route }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { conversationId, other, groupName, isGroup, participantCount } = route.params;
  const { user } = useAuth();
  const { refresh: refreshBadges } = useBadges();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const { suggestions: mentionSuggestions, onChangeText: onMentionChangeText, pickMention } = useMentionInput(text, setText);
  const [sending, setSending] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [mutedUntil, setMutedUntil] = useState(null);
  const [muteModalVisible, setMuteModalVisible] = useState(false);
  const listRef = useRef(null);

  const title = isGroup ? groupName : (other?.display_name || 'Conversation');
  const subtitle = isGroup ? `${participantCount} members` : null;

  useEffect(() => {
    navigation.setOptions({
      title,
      headerBackTitle: 'Messages',
      headerRight: () => (
        <TouchableOpacity onPress={() => setMuteModalVisible(true)} hitSlop={12} style={{ marginRight: 4 }}>
          <Ionicons
            name={isMuted ? 'notifications-off' : 'notifications-outline'}
            size={22}
            color={isMuted ? colors.textMuted : colors.text}
          />
        </TouchableOpacity>
      ),
    });
  }, [title, isMuted]);

  useEffect(() => {
    Promise.all([
      api.get(`/dm/conversations/${conversationId}/messages`),
      api.get(`/dm/conversations/${conversationId}/mute`),
    ]).then(([msgRes, muteRes]) => {
      setMessages(msgRes.data);
      setIsMuted(muteRes.data.is_muted);
      setMutedUntil(muteRes.data.muted_until);
      // Backend marks conversation read on GET messages; refresh badge counts
      refreshBadges();
    }).catch(() => {}).finally(() => setLoading(false));
  }, [conversationId]);

  const handleMute = async (duration) => {
    try {
      const { data } = await api.post(`/dm/conversations/${conversationId}/mute`, { duration });
      setIsMuted(data.is_muted);
      setMutedUntil(data.muted_until);
    } catch {
      Alert.alert('Error', 'Could not mute notifications');
    }
  };

  const handleUnmute = async () => {
    try {
      await api.delete(`/dm/conversations/${conversationId}/mute`);
      setIsMuted(false);
      setMutedUntil(null);
    } catch {
      Alert.alert('Error', 'Could not unmute notifications');
    }
  };

  const send = async () => {
    if (!text.trim() || sending) return;
    const content = text.trim();
    setText('');
    setSending(true);
    try {
      const { data } = await api.post(`/dm/conversations/${conversationId}/messages`, { content });
      setMessages(prev => [...prev, data]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch {
      setText(content);
      Alert.alert('Error', 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: spacing.md, gap: 6, paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatText}>
              {isGroup ? `Welcome to ${groupName}` : `Say hello to ${other?.display_name}`}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <MessageBubble msg={item} isMe={item.sender_id === user?.id} showSender={!!isGroup} />
        )}
      />

      <MentionSuggestions suggestions={mentionSuggestions} onSelect={pickMention} />
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={onMentionChangeText}
          placeholder={isGroup ? `Message ${groupName}…` : `Message ${other?.display_name || ''}…`}
          placeholderTextColor={colors.textDim}
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={send}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnOff]}
          onPress={send}
          disabled={!text.trim() || sending}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-up" size={18} color={colors.bg} />
        </TouchableOpacity>
      </View>

      <MuteModal
        visible={muteModalVisible}
        isMuted={isMuted}
        onClose={() => setMuteModalVisible(false)}
        onMute={handleMute}
        onUnmute={handleUnmute}
      />
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  emptyChat: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyChatText: { fontSize: 14, color: colors.textMuted },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 2 },
  bubbleRowMe: { flexDirection: 'row-reverse' },
  bubble: {
    maxWidth: '74%',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderBottomLeftRadius: 4,
    padding: 10,
    gap: 4,
  },
  bubbleMe: { backgroundColor: colors.accent, borderBottomLeftRadius: radius.md, borderBottomRightRadius: 4 },
  bubbleSender: { fontSize: 11, fontWeight: '700', color: colors.accent, marginBottom: 2 },
  bubbleText: { fontSize: 15, color: colors.text, lineHeight: 20 },
  bubbleTextMe: { color: colors.bg },
  bubbleTime: { fontSize: 10, color: colors.textDim, alignSelf: 'flex-end' },
  // Shared post
  sharedPost: {
    backgroundColor: colors.bgHover,
    borderRadius: radius.sm,
    padding: 8,
    gap: 3,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    marginBottom: 4,
  },
  sharedPostLabel: { fontSize: 10, fontWeight: '600', color: colors.accent },
  sharedPostUser: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  sharedPostContent: { fontSize: 13, color: colors.text, lineHeight: 18 },
  sharedPostHabit: { fontSize: 11, fontWeight: '600' },
  sharedEvent: {
    backgroundColor: colors.bgHover, borderRadius: radius.sm,
    padding: 8, gap: 3, borderLeftWidth: 2, borderLeftColor: colors.accent, marginBottom: 4,
  },
  sharedLabel: { fontSize: 10, fontWeight: '600', color: colors.accent },
  sharedTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  sharedMeta: { fontSize: 12, color: colors.textMuted },
  // Input
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 100,
  },
  sendBtn: { backgroundColor: colors.accent, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { backgroundColor: colors.bgHover },
  // Mute modal
  muteOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  muteSheet: { backgroundColor: colors.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34, paddingTop: 12 },
  muteHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
  muteTitle: { fontSize: 16, fontWeight: '700', color: colors.text, paddingHorizontal: spacing.lg, marginBottom: 8 },
  muteOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  unmuteOption: { borderBottomWidth: 0 },
  muteOptionText: { fontSize: 16, color: colors.text },
  muteCancelBtn: { marginTop: 8, paddingHorizontal: spacing.lg, paddingVertical: 14 },
  muteCancelText: { fontSize: 16, color: colors.textMuted, fontWeight: '600' },
  });
}
