import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useBadges } from '../context/BadgeContext';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import Avatar from '../components/Avatar';
import { API_BASE_URL, radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { timeAgo } from '../utils/timeAgo';

const TYPE_ICONS = {
  follow:           { icon: 'person-add',       bg: '#3b82f6' },
  like:             { icon: 'heart',             bg: '#ef4444' },
  comment:          { icon: 'chatbubble',        bg: '#6366f1' },
  cheer:            { icon: 'flame',             bg: '#f97316' },
  badge:            { icon: 'ribbon',            bg: '#f59e0b' },
  reminder:         { icon: 'alarm',             bg: '#eab308' },
  challenge_join:   { icon: 'shield',            bg: '#8b5cf6' },
  challenge_invite: { icon: 'mail',              bg: '#8b5cf6' },
  buddy_request:       { icon: 'people',            bg: '#14b8a6' },
  buddy_accepted:      { icon: 'checkmark-circle',  bg: '#34d399' },
  buddy_nudge:         { icon: 'notifications',     bg: '#34d399' },
  buddy_5pm_reminder:  { icon: 'alarm',             bg: '#14b8a6' },
  buddy_nudge_reminder:{ icon: 'notifications',     bg: '#14b8a6' },
  weekly_recap:        { icon: 'stats-chart',       bg: '#10b981' },
  club_event:          { icon: 'calendar',           bg: '#8b5cf6' },
};

function buildParts(n) {
  const from = n.from_display_name || n.from_username || 'Someone';
  switch (n.type) {
    case 'follow':         return { name: from, action: 'started following you' };
    case 'like':           return { name: from, action: 'liked your post' };
    case 'comment':        return { name: from, action: 'commented on your post' };
    case 'cheer':          return { name: from, action: 'cheered your post' };
    case 'buddy_request':  return { name: from, action: 'wants to be your accountability buddy' };
    case 'buddy_accepted': return { name: from, action: 'accepted your buddy request' };
    default:               return { name: null, action: n.message || '' };
  }
}

function resolvePostImage(path) {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `${API_BASE_URL}${path}`;
}

function groupNotifications(notifications = []) {
  if (!Array.isArray(notifications)) return [];
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const today = [], thisWeek = [], earlier = [];
  for (const n of notifications) {
    const d = new Date(n.created_at);
    if (d >= todayStart) today.push(n);
    else if (d >= weekStart) thisWeek.push(n);
    else earlier.push(n);
  }

  const result = [];
  if (today.length)    { result.push({ _header: true, title: 'Today' });      result.push(...today); }
  if (thisWeek.length) { result.push({ _header: true, title: 'This week' });  result.push(...thisWeek); }
  if (earlier.length)  { result.push({ _header: true, title: 'Earlier' });    result.push(...earlier); }
  return result;
}

function NotifAvatar({ notif }) {
  const { icon, bg } = TYPE_ICONS[notif.type] || { icon: 'notifications-outline', bg: '#6b7280' };
  return (
    <View style={styles.avatarWrap}>
      <Avatar
        user={{ username: notif.from_username, display_name: notif.from_display_name, avatar_url: notif.from_avatar }}
        size="md"
      />
      <View style={[styles.iconBadge, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={10} color="#fff" />
      </View>
    </View>
  );
}

function FollowBackButton({ notif }) {
  const { colors } = useTheme();
  const [following, setFollowing] = useState(!!notif.is_following_back);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (following) {
        await api.delete(`/users/${notif.from_user_id}/follow`);
        setFollowing(false);
      } else {
        await api.post(`/users/${notif.from_user_id}/follow`);
        setFollowing(true);
      }
    } catch {
      // silent — button snaps back on next render if needed
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={toggle}
      activeOpacity={0.8}
      style={[
        styles.followBtn,
        following && { backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 1 },
        !following && { backgroundColor: colors.accent },
      ]}
    >
      {loading
        ? <ActivityIndicator size="small" color={following ? colors.textMuted : '#0a0a0a'} />
        : <Text style={[styles.followBtnText, following && { color: colors.textMuted }]}>
            {following ? 'Following' : 'Follow back'}
          </Text>
      }
    </TouchableOpacity>
  );
}

function NotifItem({ notif, onPress, onAvatarPress }) {
  const { colors } = useTheme();
  const { name, action } = buildParts(notif);
  const postImageUrl = resolvePostImage(notif.post_image);
  const showThumbnail = postImageUrl && (notif.type === 'like' || notif.type === 'comment' || notif.type === 'cheer');
  const showFollowBack = notif.type === 'follow' && notif.from_user_id;

  return (
    <TouchableOpacity
      style={[styles.item, !notif.is_read && styles.itemUnread]}
      onPress={() => onPress(notif)}
      activeOpacity={0.75}
    >
      <TouchableOpacity onPress={() => onAvatarPress(notif)} activeOpacity={0.8} disabled={!notif.from_username}>
        <NotifAvatar notif={notif} />
      </TouchableOpacity>

      <View style={styles.textBlock}>
        <Text style={[styles.text, { color: colors.text }]} numberOfLines={2}>
          {name ? (
            <>
              <Text style={styles.name}>{name}</Text>
              {' '}
              <Text style={{ color: colors.textMuted }}>{action}</Text>
            </>
          ) : (
            <Text style={{ color: colors.textMuted }}>{action}</Text>
          )}
        </Text>
        <Text style={[styles.time, { color: colors.textDim }]}>{timeAgo(notif.created_at)}</Text>
      </View>

      {showFollowBack ? (
        <FollowBackButton notif={notif} />
      ) : showThumbnail ? (
        <Image source={{ uri: postImageUrl }} style={styles.thumb} />
      ) : !notif.is_read ? (
        <View style={styles.dot} />
      ) : null}

      {showThumbnail && !notif.is_read && <View style={styles.dot} />}
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { refresh: refreshBadges } = useBadges();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/notifications')
      .then(r => setNotifications(groupNotifications(r.data.notifications)))
      .catch(() => {})
      .finally(() => setLoading(false));

    const markReadTimer = setTimeout(() => {
      api.put('/notifications/read').catch(() => {});
      refreshBadges();
    }, 2500);
    return () => clearTimeout(markReadTimer);
  }, [refreshBadges]);

  const handlePress = (notif) => {
    if (notif.type === 'weekly_recap') {
      navigation.navigate('WeeklyRecap', notif.reference_id ? { week: notif.reference_id } : undefined);
    } else if (notif.type === 'club_event' && notif.reference_id) {
      navigation.navigate('Events', { highlightEventId: notif.reference_id });
    } else if ((notif.type === 'like' || notif.type === 'comment' || notif.type === 'cheer') && notif.post_id) {
      navigation.navigate('Comments', { postId: notif.post_id });
    } else if (notif.from_username) {
      navigation.navigate('UserProfile', { username: notif.from_username });
    }
  };

  const handleAvatarPress = (notif) => {
    if (notif.from_username) navigation.navigate('UserProfile', { username: notif.from_username });
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={notifications}
      keyExtractor={(item, i) => item._header ? `h-${item.title}` : item.id}
      renderItem={({ item }) => {
        if (item._header) {
          return (
            <View style={[styles.sectionHeader, { backgroundColor: colors.bg }]}>
              <Text style={[styles.sectionTitle, { color: colors.textDim }]}>{item.title}</Text>
            </View>
          );
        }
        return <NotifItem notif={item} onPress={handlePress} onAvatarPress={handleAvatarPress} />;
      }}
      style={[styles.list, { backgroundColor: colors.bg }]}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>All caught up</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>Notifications will appear here.</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: 20,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
  },
  itemUnread: {
    borderLeftWidth: 2,
    borderLeftColor: '#34d399',
    paddingLeft: spacing.lg - 2,
  },
  avatarWrap: {
    position: 'relative',
    width: 40,
    height: 40,
  },
  iconBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  text: {
    fontSize: 14,
    lineHeight: 19,
  },
  name: {
    fontWeight: '700',
    fontSize: 14,
  },
  time: {
    fontSize: 11,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#1f1f1f',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#34d399',
    flexShrink: 0,
  },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  emptyText: { fontSize: 13, textAlign: 'center' },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0a0a0a',
  },
});
