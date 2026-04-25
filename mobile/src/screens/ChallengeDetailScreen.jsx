import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal, ScrollView,
  TextInput, KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import ForwardModal from '../components/ForwardModal';
import StreakBadge from '../components/StreakBadge';
import MentionSuggestions from '../components/MentionSuggestions';
import useMentionInput from '../hooks/useMentionInput';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

function formatDate(d) {
  if (!d) return '∞';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function friendsGoingText(names, count) {
  if (!count) return null;
  const list = names ? names.split('||') : [];
  if (count === 1) return `${list[0]} is going`;
  if (count === 2) return `${list[0]} and ${list[1]} are going`;
  if (count === 3 && list.length === 3) return `${list[0]}, ${list[1]} and ${list[2]} are going`;
  return `${list.slice(0, 2).join(', ')} and ${count - 2} more you follow are going`;
}

function formatEventDate(d) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function ForwardedEventCard({ event, currentUser, onDelete }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [going, setGoing] = useState(event.my_status === 'going');
  const [goingCount, setGoingCount] = useState(event.going_count);
  const [loading, setLoading] = useState(false);
  const [showForward, setShowForward] = useState(false);
  const isOwner = event.creator_id === currentUser?.id;

  const handleRsvp = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(`/events/${event.id}/rsvp`);
      const nowGoing = data.status === 'going';
      setGoing(nowGoing);
      setGoingCount(c => nowGoing ? c + 1 : Math.max(0, c - 1));
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Event', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`/events/${event.id}`); onDelete(event.id); }
        catch (err) { Alert.alert('Error', err.response?.data?.error || 'Failed'); }
      }},
    ]);
  };

  return (
    <View style={styles.forwardedCard}>
      {/* Forwarded header - like a forwarded message */}
      <View style={styles.forwardedHeader}>
        <Text style={styles.forwardedIcon}>↪</Text>
        <Text style={styles.forwardedLabel}>
          <Text style={styles.forwardedName}>{event.display_name}</Text>
          <Text style={styles.forwardedSub}> shared an event</Text>
        </Text>
        {isOwner && (
          <TouchableOpacity onPress={handleDelete} hitSlop={10} style={{ marginLeft: 'auto' }}>
            <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Event content card */}
      <View style={styles.forwardedBody}>
        <Text style={styles.forwardedEventTitle}>{event.title}</Text>
        {event.description ? <Text style={styles.forwardedEventDesc}>{event.description}</Text> : null}
        <View style={styles.forwardedMeta}>
          <Text style={styles.forwardedMetaText}>📅 {formatEventDate(event.event_date)}{event.event_time ? `  🕐 ${event.event_time}` : ''}</Text>
          {event.location ? <Text style={styles.forwardedMetaText}>📍 {event.location}</Text> : null}
        </View>
        {event.friends_going_count > 0 && (
          <View style={styles.friendsGoing}>
            <Ionicons name="people" size={13} color={colors.accent} />
            <Text style={styles.friendsGoingText}>
              {friendsGoingText(event.friends_going_names, event.friends_going_count)}
            </Text>
          </View>
        )}
        <View style={styles.forwardedFooter}>
          <Text style={styles.forwardedGoingText}>{goingCount > 0 ? `${goingCount} going` : 'Be the first to RSVP'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={() => setShowForward(true)} hitSlop={8}>
              <Ionicons name="arrow-redo-outline" size={24} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.forwardedRsvpBtn, going && styles.forwardedRsvpBtnGoing]}
              onPress={handleRsvp}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={[styles.forwardedRsvpText, going && { color: '#fff' }]}>{going ? '✓ Going' : 'RSVP'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <ForwardModal visible={showForward} onClose={() => setShowForward(false)} type="event" item={event} />
    </View>
  );
}

function EventsTab({ clubId, currentUser }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/events/club/${clubId}`)
      .then(r => setEvents(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clubId]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;

  return (
    <FlatList
      data={events}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <ForwardedEventCard
          event={item}
          currentUser={currentUser}
          onDelete={id => setEvents(prev => prev.filter(e => e.id !== id))}
        />
      )}
      contentContainerStyle={events.length === 0 ? { flex: 1 } : { paddingVertical: 12, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <View style={styles.emptyMembers}>
          <Text style={styles.emptyText}>No upcoming events in this club.{'\n'}Share one using the + button!</Text>
        </View>
      }
    />
  );
}

function MemberRow({ member, rank, currentUserId }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const isMe = member.id === currentUserId;
  const rankEmojis = { 1: '🥇', 2: '🥈', 3: '🥉' };
  return (
    <TouchableOpacity
      style={[styles.memberRow, isMe && styles.memberRowMe]}
      onPress={() => navigation.navigate('UserProfile', { username: member.username })}
      activeOpacity={0.8}
    >
      <Text style={styles.rankNum}>{rankEmojis[rank] || `#${rank}`}</Text>
      <Avatar user={member} size="sm" />
      <View style={{ flex: 1 }}>
        <Text style={styles.memberName}>
          {member.display_name}
          {isMe && <Text style={{ color: colors.accent }}> (you)</Text>}
        </Text>
        <Text style={styles.memberHandle}>@{member.username}</Text>
      </View>
      <StreakBadge streak={member.streak || 0} />
    </TouchableOpacity>
  );
}

function RequestRow({ request, challengeId, onApprove, onReject }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();

  const approve = async () => {
    setLoading(true);
    try {
      await api.post(`/clubs/${challengeId}/members/${request.id}/approve`);
      onApprove(request.id);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed');
      setLoading(false);
    }
  };

  const reject = async () => {
    setLoading(true);
    try {
      await api.delete(`/clubs/${challengeId}/members/${request.id}/reject`);
      onReject(request.id);
    } catch {
      setLoading(false);
    }
  };

  return (
    <View style={styles.requestRow}>
      <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { username: request.username })} activeOpacity={0.8} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
        <Avatar user={request} size="sm" />
        <View>
          <Text style={styles.memberName}>{request.display_name}</Text>
          <Text style={styles.memberHandle}>@{request.username}</Text>
        </View>
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity style={styles.approveBtn} onPress={approve} disabled={loading} activeOpacity={0.8}>
          <Text style={styles.approveBtnText}>{loading ? '…' : 'Approve'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.rejectBtn} onPress={reject} disabled={loading} activeOpacity={0.8}>
          <Text style={styles.rejectBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const MUTE_OPTIONS = [
  { label: '1 hour', value: '1h' },
  { label: '3 hours', value: '3h' },
  { label: '5 hours', value: '5h' },
  { label: '24 hours', value: '1d' },
  { label: 'Forever', value: 'forever' },
];

function ChatMuteModal({ visible, isMuted, onClose, onMute, onUnmute }) {
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

function ChatTab({ challengeId, insets }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const { suggestions: mentionSuggestions, onChangeText: onMentionChangeText, pickMention } = useMentionInput(text, setText);
  const [sending, setSending] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [muteModalVisible, setMuteModalVisible] = useState(false);
  const listRef = useRef(null);

  const loadMessages = useCallback(async () => {
    try {
      const [msgRes, muteRes] = await Promise.all([
        api.get(`/clubs/${challengeId}/messages`),
        api.get(`/clubs/${challengeId}/chat/mute`),
      ]);
      setMessages(msgRes.data);
      setIsMuted(muteRes.data.is_muted);
    } catch {
      // not a member - messages will be empty
    } finally {
      setLoading(false);
    }
  }, [challengeId]);

  const handleMute = async (duration) => {
    try {
      const { data } = await api.post(`/clubs/${challengeId}/chat/mute`, { duration });
      setIsMuted(data.is_muted);
    } catch {
      Alert.alert('Error', 'Could not mute notifications');
    }
  };

  const handleUnmute = async () => {
    try {
      await api.delete(`/clubs/${challengeId}/chat/mute`);
      setIsMuted(false);
    } catch {
      Alert.alert('Error', 'Could not unmute notifications');
    }
  };

  useFocusEffect(useCallback(() => {
    loadMessages();
  }, [loadMessages]));

  const send = async () => {
    if (!text.trim() || sending) return;
    const content = text.trim();
    setText('');
    setSending(true);
    try {
      const { data } = await api.post(`/clubs/${challengeId}/messages`, { content });
      setMessages(prev => [...prev, data]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      setText(content);
      Alert.alert('Error', err.response?.data?.error || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <View style={styles.chatHeaderBar}>
        <Text style={styles.chatHeaderLabel}>Club Chat</Text>
        <TouchableOpacity onPress={() => setMuteModalVisible(true)} hitSlop={12}>
          <Ionicons
            name={isMuted ? 'notifications-off' : 'notifications-outline'}
            size={20}
            color={isMuted ? colors.textMuted : colors.text}
          />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: spacing.md, gap: 4, paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.chatEmpty}>
            <Text style={styles.chatEmptyText}>No messages yet. Start the conversation.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isMe = item.user_id === user?.id;
          return (
            <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
              {!isMe && <Avatar user={{ avatar_url: item.avatar_url, display_name: item.display_name }} size="xs" />}
              <View style={[styles.msgBubble, isMe && styles.msgBubbleMe]}>
                {!isMe && <Text style={styles.msgSender}>{item.display_name}</Text>}
                <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{item.content}</Text>
                <Text style={[styles.msgTime, isMe && { color: 'rgba(255,255,255,0.5)' }]}>{formatTime(item.created_at)}</Text>
              </View>
            </View>
          );
        }}
      />

      <MentionSuggestions suggestions={mentionSuggestions} onSelect={pickMention} />
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.chatInput}
          value={text}
          onChangeText={onMentionChangeText}
          placeholder="Message…"
          placeholderTextColor={colors.textDim}
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={send}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={send}
          disabled={!text.trim() || sending}
          activeOpacity={0.8}
        >
          <Text style={styles.sendBtnText}>→</Text>
        </TouchableOpacity>
      </View>

      <ChatMuteModal
        visible={muteModalVisible}
        isMuted={isMuted}
        onClose={() => setMuteModalVisible(false)}
        onMute={handleMute}
        onUnmute={handleUnmute}
      />
    </KeyboardAvoidingView>
  );
}

export default function ChallengeDetailScreen({ route }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { id } = route.params;
  const { user } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [challenge, setChallenge] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [habits, setHabits] = useState([]);
  const [linkedHabit, setLinkedHabit] = useState(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedHabit, setSelectedHabit] = useState('');
  const [linking, setLinking] = useState(false);
  const [activeTab, setActiveTab] = useState('leaderboard');
  const [pendingRequests, setPendingRequests] = useState([]);
  const [showForwardClub, setShowForwardClub] = useState(false);

  useEffect(() => {
    api.get(`/clubs/${id}`)
      .then(r => {
        setChallenge(r.data);
        setPendingRequests(r.data.pending_requests || []);
        setLinkedHabit(r.data.my_linked_habit || null);
        if (r.data.my_linked_habit) setSelectedHabit(r.data.my_linked_habit.id);
      })
      .finally(() => setLoading(false));
    api.get('/habits').then(r => setHabits(r.data.filter(h => h.is_active))).catch(() => {});
  }, [id]);

  const handleDeleteClub = () => {
    Alert.alert(
      'Delete Club',
      'This will permanently delete the club and all its data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/clubs/${id}`);
              navigation.goBack();
            } catch (err) {
              Alert.alert('Error', err.response?.data?.error || 'Could not delete club');
            }
          },
        },
      ]
    );
  };

  const toggleJoin = async () => {
    setJoining(true);
    try {
      if (challenge.memberStatus === 'active') {
        await api.delete(`/clubs/${id}/leave`);
        const newCount = Math.max(0, challenge.member_count - 1);
        setChallenge(c => ({ ...c, memberStatus: null, member_count: newCount }));
        if (newCount === 0) {
          await api.delete(`/clubs/${id}`).catch(() => {});
          navigation.goBack();
          return;
        }
      } else if (challenge.memberStatus === 'pending') {
        Alert.alert('Request Pending', 'Your request is awaiting approval from the creator.');
      } else {
        const { data } = await api.post(`/clubs/${id}/join`);
        setChallenge(c => ({
          ...c,
          memberStatus: data.memberStatus,
          member_count: data.memberStatus === 'active' ? c.member_count + 1 : c.member_count,
        }));
      }
    } finally {
      setJoining(false);
    }
  };

  const linkHabit = async () => {
    if (!selectedHabit) return;
    setLinking(true);
    try {
      await api.post(`/clubs/${id}/link-habit`, { habit_id: selectedHabit });
      const linked = habits.find(h => h.id === selectedHabit);
      setLinkedHabit(linked ? { id: linked.id, name: linked.name, color: linked.color } : null);
      setShowLinkModal(false);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to link');
    } finally {
      setLinking(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>;
  }
  if (!challenge) {
    return <View style={styles.center}><Text style={{ color: colors.textMuted }}>Club not found</Text></View>;
  }

  const isCreator = user?.id === challenge.creator_id;
  const isPrivate = challenge.visibility === 'private';
  const isActiveMember = challenge.memberStatus === 'active';
  const isPending = challenge.memberStatus === 'pending';
  const canChat = isActiveMember;

  const days = challenge.end_date
    ? Math.ceil((new Date(challenge.end_date) - Date.now()) / 86400000)
    : null;

  const sorted = [...(challenge.members || [])].sort((a, b) => b.streak - a.streak);

  const tabs = [
    { key: 'leaderboard', label: 'Leaderboard' },
    { key: 'events', label: 'Events' },
    ...(canChat ? [{ key: 'chat', label: 'Chat' }] : []),
    ...(isCreator && isPrivate && pendingRequests.length > 0 ? [{ key: 'requests', label: `Requests (${pendingRequests.length})` }] : []),
  ];

  const joinLabel = () => {
    if (joining) return '…';
    if (isPending) return 'Pending…';
    if (isActiveMember) return 'Leave';
    return isPrivate ? 'Request to Join' : 'Join Club';
  };

  const InfoCard = (
    <View style={styles.infoCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Text style={styles.challengeName}>{challenge.name}</Text>
        {isPrivate && <View style={styles.privatePill}><Text style={styles.privatePillText}>Private</Text></View>}
      </View>
      <Text style={styles.challengeMeta}>@{challenge.username} · {challenge.frequency} · {challenge.member_count} members</Text>
      <Text style={styles.challengeMeta}>
        {formatDate(challenge.start_date)} → {formatDate(challenge.end_date)}
        {days !== null && days > 0 && ` · ${days} days left`}
      </Text>
      {!!challenge.description && <Text style={styles.challengeDesc}>{challenge.description}</Text>}

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.joinBtn, (isActiveMember || isPending) && styles.joinBtnOutline]}
          onPress={toggleJoin}
          disabled={joining}
          activeOpacity={0.85}
        >
          <Text style={[styles.joinBtnText, (isActiveMember || isPending) && { color: colors.text }]}>
            {joinLabel()}
          </Text>
        </TouchableOpacity>

        {isActiveMember && (
          <TouchableOpacity
            style={[styles.linkBtn, linkedHabit && styles.linkBtnLinked]}
            onPress={() => setShowLinkModal(true)}
            activeOpacity={0.85}
          >
            <View style={linkedHabit ? [styles.linkedDot, { backgroundColor: linkedHabit.color }] : null} />
            <Text style={[styles.linkBtnText, linkedHabit && styles.linkBtnTextLinked]}>
              {linkedHabit ? linkedHabit.name : 'Link Habit'}
            </Text>
            {linkedHabit && <Ionicons name="pencil" size={11} color={colors.accent} />}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.linkBtn} onPress={() => setShowForwardClub(true)} activeOpacity={0.85}>
          <Ionicons name="arrow-redo-outline" size={15} color={colors.text} />
          <Text style={styles.linkBtnText}>Share</Text>
        </TouchableOpacity>

        {isCreator && (
          <TouchableOpacity style={styles.deleteClubBtn} onPress={handleDeleteClub} activeOpacity={0.85}>
            <Ionicons name="trash-outline" size={15} color="#ef4444" />
          </TouchableOpacity>
        )}
      </View>

      {isPending && isPrivate && (
        <Text style={styles.pendingNote}>Your request is waiting for the creator's approval.</Text>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {InfoCard}

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t.key}
            style={styles.tabBtn}
            onPress={() => setActiveTab(t.key)}
            activeOpacity={0.75}
          >
            <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>{t.label}</Text>
            {activeTab === t.key && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      {activeTab === 'leaderboard' && (
        <FlatList
          data={sorted}
          keyExtractor={item => item.id}
          renderItem={({ item, index }) => <MemberRow member={item} rank={index + 1} currentUserId={user?.id} />}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyMembers}>
              <Text style={styles.emptyText}>
                {isPrivate && !isActiveMember && !isCreator
                  ? 'Join the club to see the leaderboard.'
                  : 'No members yet - join and be #1!'}
              </Text>
            </View>
          }
        />
      )}

      {activeTab === 'events' && (
        <EventsTab clubId={id} currentUser={user} />
      )}

      {activeTab === 'chat' && canChat && (
        <ChatTab challengeId={id} insets={insets} />
      )}

      {activeTab === 'requests' && isCreator && (
        <FlatList
          data={pendingRequests}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <RequestRow
              request={item}
              challengeId={id}
              onApprove={uid => {
                setPendingRequests(p => p.filter(r => r.id !== uid));
                setChallenge(c => ({ ...c, member_count: c.member_count + 1 }));
              }}
              onReject={uid => setPendingRequests(p => p.filter(r => r.id !== uid))}
            />
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyMembers}>
              <Text style={styles.emptyText}>No pending requests.</Text>
            </View>
          }
        />
      )}

      <ForwardModal visible={showForwardClub} onClose={() => setShowForwardClub(false)} type="club" item={challenge} />

      {/* Link habit modal */}
      <Modal visible={showLinkModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowLinkModal(false)}>
        <View style={styles.linkModal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowLinkModal(false)}>
              <Text style={{ color: colors.textMuted }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{linkedHabit ? 'Change Linked Habit' : 'Link a Habit'}</Text>
            <TouchableOpacity onPress={linkHabit} disabled={linking || !selectedHabit}>
              <Text style={{ color: selectedHabit ? colors.accent : colors.textDim, fontWeight: '700' }}>
                {linking ? '…' : linkedHabit ? 'Update' : 'Link'}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
            {linkedHabit && (
              <View style={[styles.currentLinkBanner, { borderColor: linkedHabit.color }]}>
                <View style={[styles.linkedDot, { backgroundColor: linkedHabit.color, width: 10, height: 10, borderRadius: 5 }]} />
                <Text style={[styles.currentLinkText, { color: linkedHabit.color }]}>Currently linked: {linkedHabit.name}</Text>
              </View>
            )}
            <Text style={styles.linkDesc}>{linkedHabit ? 'Choose a different habit to link to this club.' : 'Link your personal habit to track progress in this challenge.'}</Text>
            {habits.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>No active habits. Create one in the Habits tab first.</Text>
            ) : (
              habits.map(h => (
                <TouchableOpacity
                  key={h.id}
                  style={[styles.habitOption, selectedHabit === h.id && styles.habitOptionSelected]}
                  onPress={() => setSelectedHabit(h.id)}
                >
                  <View style={[styles.habitDot, { backgroundColor: h.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.habitOptName}>{h.name}</Text>
                    <Text style={styles.habitOptStreak}>🔥 {h.streak}d streak</Text>
                  </View>
                  {selectedHabit === h.id && <Text style={{ color: colors.accent, fontSize: 16 }}>✓</Text>}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  infoCard: { margin: spacing.lg, marginBottom: 0, backgroundColor: colors.bgCard, borderRadius: radius.md, padding: spacing.lg, gap: 5 },
  privatePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.xs, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgHover },
  privatePillText: { fontSize: 10, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  challengeName: { fontSize: 20, fontWeight: '800', color: colors.text, flexShrink: 1 },
  challengeMeta: { fontSize: 12, color: colors.textMuted },
  challengeDesc: { fontSize: 14, color: colors.text, lineHeight: 20, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  joinBtn: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: 16, paddingVertical: 8 },
  joinBtnOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border },
  joinBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.bgHover, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.borderSubtle },
  linkBtnLinked: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  linkBtnText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  linkBtnTextLinked: { color: colors.accent },
  linkedDot: { width: 8, height: 8, borderRadius: 4 },
  deleteClubBtn: { backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', justifyContent: 'center', alignItems: 'center' },
  pendingNote: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic', marginTop: 4 },
  // Tabs
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, marginTop: spacing.md },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 11, position: 'relative' },
  tabLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabLabelActive: { color: colors.accent },
  tabIndicator: { position: 'absolute', bottom: 0, height: 2, width: '50%', backgroundColor: colors.accent, borderRadius: 1 },
  // Leaderboard
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  memberRowMe: { backgroundColor: colors.accentDim },
  rankNum: { fontSize: 18, fontWeight: '800', width: 32, textAlign: 'center', color: colors.textMuted },
  memberName: { fontSize: 14, fontWeight: '600', color: colors.text },
  memberHandle: { fontSize: 12, color: colors.textMuted },
  emptyMembers: { padding: 40, alignItems: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  // Requests
  requestRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  approveBtn: { backgroundColor: colors.green, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 7 },
  approveBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  rejectBtn: { backgroundColor: colors.bgHover, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 7 },
  rejectBtnText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  // Chat
  chatHeaderBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  chatHeaderLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  chatEmpty: { flex: 1, alignItems: 'center', paddingTop: 60 },
  chatEmptyText: { color: colors.textMuted, fontSize: 14 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 2 },
  msgRowMe: { flexDirection: 'row-reverse' },
  msgBubble: { maxWidth: '72%', backgroundColor: colors.bgCard, borderRadius: radius.md, borderBottomLeftRadius: 4, padding: 10, gap: 2 },
  msgBubbleMe: { backgroundColor: colors.accent, borderBottomLeftRadius: radius.md, borderBottomRightRadius: 4 },
  msgSender: { fontSize: 11, fontWeight: '700', color: colors.accent, marginBottom: 2 },
  msgText: { fontSize: 14, color: colors.text, lineHeight: 19 },
  msgTextMe: { color: 'white' },
  msgTime: { fontSize: 10, color: colors.textDim, alignSelf: 'flex-end' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: spacing.md, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bg,
  },
  chatInput: {
    flex: 1, backgroundColor: colors.bgInput, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    color: colors.text, fontSize: 15,
    paddingHorizontal: 14, paddingVertical: 10,
    maxHeight: 100,
  },
  sendBtn: { backgroundColor: colors.accent, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.bgHover },
  sendBtnText: { color: 'white', fontSize: 18, fontWeight: '700', lineHeight: 22 },
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
  // Forwarded event card
  forwardedCard: { marginHorizontal: spacing.lg, marginBottom: 12 },
  forwardedHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, paddingLeft: 2 },
  forwardedIcon: { fontSize: 13, color: colors.accent },
  forwardedLabel: { fontSize: 13 },
  forwardedName: { fontWeight: '700', color: colors.text },
  forwardedSub: { color: colors.textMuted },
  forwardedBody: {
    borderLeftWidth: 3, borderLeftColor: colors.accent,
    backgroundColor: colors.bgCard, borderRadius: radius.md,
    padding: 14, gap: 6,
  },
  forwardedEventTitle: { fontSize: 16, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  forwardedEventDesc: { fontSize: 14, color: colors.textMuted, lineHeight: 19 },
  forwardedMeta: { gap: 3 },
  forwardedMetaText: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
  forwardedFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  forwardedGoingText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  forwardedRsvpBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.accent },
  forwardedRsvpBtnGoing: { backgroundColor: colors.accent },
  forwardedRsvpText: { fontSize: 13, fontWeight: '700', color: colors.accent },
  friendsGoing: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  friendsGoingText: { fontSize: 12, color: colors.accent, fontWeight: '600', flex: 1 },
  // Link modal
  linkModal: { flex: 1, backgroundColor: colors.bg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  currentLinkBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.sm, borderWidth: 1, backgroundColor: colors.bgHover, marginBottom: 12 },
  currentLinkText: { fontSize: 13, fontWeight: '600' },
  linkDesc: { fontSize: 14, color: colors.textMuted, marginBottom: 16, lineHeight: 20 },
  habitOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 10, borderRadius: radius.sm },
  habitOptionSelected: { backgroundColor: colors.accentDim },
  habitDot: { width: 10, height: 10, borderRadius: 5 },
  habitOptName: { fontSize: 15, fontWeight: '600', color: colors.text },
  habitOptStreak: { fontSize: 12, color: colors.textMuted },
  });
}
