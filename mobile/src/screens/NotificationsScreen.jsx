import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import api from '../api/client';
import Avatar from '../components/Avatar';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const TYPE_LABELS = {
  follow: 'Follow',
  like: 'Like',
  comment: 'Reply',
  cheer: 'Cheer',
  badge: 'Badge',
  reminder: 'Remind',
  challenge_join: 'Club',
  challenge_invite: 'Invite',
  buddy_request: 'Buddy',
  buddy_accepted: 'Buddy',
};

function buildText(n) {
  const from = n.from_display_name || n.from_username;
  switch (n.type) {
    case 'follow': return `${from} started following you`;
    case 'like': return `${from} liked your post`;
    case 'comment': return `${from} commented on your post`;
    case 'cheer': return `${from} cheered your post`;
    case 'buddy_request': return `${from} wants to be your accountability buddy`;
    case 'buddy_accepted': return `${from} accepted your buddy request`;
    default: return n.message || '';
  }
}

function NotifItem({ notif, onPress, onAvatarPress }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <TouchableOpacity
      style={[styles.item, !notif.is_read && styles.itemUnread]}
      onPress={() => onPress(notif)}
      activeOpacity={0.8}
    >
      <View style={styles.typeLabel}><Text style={styles.typeLabelText}>{TYPE_LABELS[notif.type] || 'Alert'}</Text></View>
      {notif.from_username ? (
        <TouchableOpacity onPress={() => onAvatarPress(notif)} hitSlop={8} activeOpacity={0.7}>
          <Avatar user={{ username: notif.from_username, display_name: notif.from_display_name, avatar_url: notif.from_avatar }} size="sm" />
        </TouchableOpacity>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.text}>{buildText(notif)}</Text>
        <Text style={styles.time}>{timeAgo(notif.created_at)}</Text>
      </View>
      {!notif.is_read && <View style={styles.dot} />}
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/notifications')
      .then(r => setNotifications(r.data.notifications))
      .finally(() => setLoading(false));

    // Mark all read after brief delay
    setTimeout(() => api.put('/notifications/read').catch(() => {}), 2500);
  }, []);

  const handlePress = (notif) => {
    if ((notif.type === 'like' || notif.type === 'comment') && notif.post_id) {
      navigation.navigate('Comments', { postId: notif.post_id });
    } else if (notif.from_username) {
      navigation.navigate('UserProfile', { username: notif.from_username });
    }
  };

  const handleAvatarPress = (notif) => {
    if (notif.from_username) {
      navigation.navigate('UserProfile', { username: notif.from_username });
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>;
  }

  return (
    <FlatList
      data={notifications}
      keyExtractor={item => item.id}
      renderItem={({ item }) => <NotifItem notif={item} onPress={handlePress} onAvatarPress={handleAvatarPress} />}
      style={styles.list}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptyText}>Notifications will appear here.</Text>
        </View>
      }
    />
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  itemUnread: {
    backgroundColor: colors.accentDim,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  typeLabel: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.xs, backgroundColor: colors.bgHover, borderWidth: 1, borderColor: colors.borderSubtle },
  typeLabelText: { fontSize: 10, fontWeight: '500', color: colors.textMuted },
  text: { fontSize: 14, color: colors.text, lineHeight: 19, flexShrink: 1 },
  time: { fontSize: 11, color: colors.textDim, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 6 },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  });
}
