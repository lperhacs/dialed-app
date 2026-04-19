import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import ForwardModal from '../components/ForwardModal';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

function friendsGoingText(names, count) {
  if (!count) return null;
  const list = names ? names.split('||') : [];
  if (count === 1) return `${list[0]} is going`;
  if (count === 2) return `${list[0]} and ${list[1]} are going`;
  if (count === 3 && list.length === 3) return `${list[0]}, ${list[1]} and ${list[2]} are going`;
  return `${list.slice(0, 2).join(', ')} and ${count - 2} more are going`;
}

function formatEventDate(d) {
  return new Date(d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function formatEventDateShort(d) {
  const date = new Date(d);
  return {
    day: date.toLocaleDateString('en-US', { day: 'numeric' }),
    month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
  };
}

function EventFeedCard({ event, currentUser, onDelete, onRsvpToggle }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [going, setGoing] = useState(event.my_status === 'going');
  const [goingCount, setGoingCount] = useState(event.going_count);
  const [loading, setLoading] = useState(false);
  const [showForward, setShowForward] = useState(false);
  const isOwner = event.creator_id === currentUser?.id;
  const dateInfo = formatEventDateShort(event.event_date);

  const handleRsvp = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(`/events/${event.id}/rsvp`);
      const nowGoing = data.status === 'going';
      setGoing(nowGoing);
      setGoingCount(c => nowGoing ? c + 1 : Math.max(0, c - 1));
      onRsvpToggle?.(event.id, nowGoing);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Event', 'Are you sure you want to delete this event?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/events/${event.id}`);
            onDelete(event.id);
          } catch (err) {
            Alert.alert('Error', err.response?.data?.error || 'Failed');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.card}>
      {/* Shared to club banner */}
      {event.club_id && event.club_name ? (
        <View style={styles.sharedBanner}>
          <Ionicons name="arrow-redo" size={12} color={colors.textMuted} />
          <Text style={styles.sharedBannerText}>
            Shared to <Text style={styles.sharedBannerClub}>{event.club_name}</Text>
          </Text>
        </View>
      ) : null}

      {/* Top row: date badge + content */}
      <View style={styles.cardBody}>
        {/* Date badge */}
        <View style={styles.dateBadge}>
          <Text style={styles.dateBadgeMonth}>{dateInfo.month}</Text>
          <Text style={styles.dateBadgeDay}>{dateInfo.day}</Text>
        </View>

        {/* Event info */}
        <View style={styles.cardContent}>
          {isOwner && (
            <TouchableOpacity onPress={handleDelete} hitSlop={8} activeOpacity={0.6} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={16} color={colors.textDim} />
            </TouchableOpacity>
          )}
          <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
          {event.description ? (
            <Text style={styles.eventDesc} numberOfLines={2}>{event.description}</Text>
          ) : null}

          {/* Meta row */}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
              <Text style={styles.metaText}>
                {dateInfo.weekday}, {formatEventDate(event.event_date)}
                {event.event_time ? `  ·  ${event.event_time}` : ''}
              </Text>
            </View>
            {event.location ? (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                <Text style={styles.metaText} numberOfLines={1}>{event.location}</Text>
              </View>
            ) : null}
            {!event.is_public ? (
              <View style={styles.metaItem}>
                <Ionicons name="lock-closed-outline" size={12} color={colors.textMuted} />
                <Text style={styles.metaText}>Friends only</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {/* Friends going */}
      {event.friends_going_count > 0 && (
        <View style={styles.friendsRow}>
          <Ionicons name="people-outline" size={13} color={colors.accent} />
          <Text style={styles.friendsText}>
            {friendsGoingText(event.friends_going_names, event.friends_going_count)}
          </Text>
        </View>
      )}

      {/* Divider */}
      <View style={styles.cardDivider} />

      {/* Footer */}
      <View style={styles.cardFooter}>
        {/* Author */}
        <View style={styles.authorRow}>
          <Avatar
            user={{ username: event.username, display_name: event.display_name, avatar_url: event.avatar_url }}
            size="xs"
          />
          <Text style={styles.authorName}>{event.display_name}</Text>
        </View>

        {/* Actions */}
        <View style={styles.footerActions}>
          {goingCount > 0 && (
            <Text style={styles.goingCount}>{goingCount} going</Text>
          )}
          <TouchableOpacity
            onPress={() => setShowForward(true)}
            hitSlop={8}
            activeOpacity={0.6}
            style={styles.shareBtn}
          >
            <Ionicons name="arrow-redo-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rsvpBtn, going && styles.rsvpBtnGoing]}
            onPress={handleRsvp}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color={going ? colors.bg : colors.accent} />
            ) : (
              <Text style={[styles.rsvpBtnText, going && styles.rsvpBtnTextGoing]}>
                {going ? 'Going' : 'RSVP'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ForwardModal
        visible={showForward}
        onClose={() => setShowForward(false)}
        type="event"
        item={event}
      />
    </View>
  );
}

export default function EventsScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { user } = useAuth();
  const [tab, setTab] = useState('discover');
  const [discoverEvents, setDiscoverEvents] = useState([]);
  const [myEvents, setMyEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const events = tab === 'discover' ? discoverEvents : myEvents;

  const load = async () => {
    try {
      const [discoverRes, mineRes] = await Promise.all([
        api.get('/events/discover'),
        api.get('/events/mine'),
      ]);
      setDiscoverEvents(discoverRes.data);
      setMyEvents(mineRes.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleDelete = (id) => {
    setDiscoverEvents(prev => prev.filter(e => e.id !== id));
    setMyEvents(prev => prev.filter(e => e.id !== id));
  };

  const handleRsvpToggle = (eventId, nowGoing) => {
    const update = evs => evs.map(e =>
      e.id === eventId ? { ...e, my_status: nowGoing ? 'going' : null } : e
    );
    setDiscoverEvents(update);
    setMyEvents(update);
    api.get('/events/mine').then(r => setMyEvents(r.data)).catch(() => {});
  };

  if (loading) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Segmented control */}
      <View style={styles.header}>
        <View style={styles.segmented}>
          {[{ key: 'discover', label: 'Discover' }, { key: 'mine', label: 'My Events' }].map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.segment, tab === t.key && styles.segmentActive]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentText, tab === t.key && styles.segmentTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={events}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <EventFeedCard
            event={item}
            currentUser={user}
            onDelete={handleDelete}
            onRsvpToggle={handleRsvpToggle}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        contentContainerStyle={events.length === 0 ? styles.emptyContainer : styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="calendar-outline" size={28} color={colors.textDim} />
            </View>
            <Text style={styles.emptyTitle}>
              {tab === 'discover' ? 'No events yet' : 'No RSVPs yet'}
            </Text>
            <Text style={styles.emptyText}>
              {tab === 'discover'
                ? 'Events from people you follow will appear here.'
                : 'Events you RSVP to will show up here.'}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    loadingCenter: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.bg,
    },

    /* Header */
    header: {
      paddingHorizontal: spacing.lg,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
      backgroundColor: colors.bg,
    },
    /* Segmented control */
    segmented: {
      flexDirection: 'row',
      backgroundColor: colors.bgHover,
      borderRadius: radius.sm,
      padding: 3,
    },
    segment: {
      flex: 1,
      paddingVertical: 7,
      alignItems: 'center',
      borderRadius: radius.sm - 1,
    },
    segmentActive: {
      backgroundColor: colors.bgCard,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 2,
      elevation: 2,
    },
    segmentText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textMuted,
    },
    segmentTextActive: {
      color: colors.text,
      fontWeight: '600',
    },

    /* List */
    listContent: { paddingVertical: 12, paddingHorizontal: spacing.lg },
    emptyContainer: { flex: 1 },
    separator: { height: 10 },

    /* Card */
    card: {
      backgroundColor: colors.bgCard,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      overflow: 'hidden',
    },

    /* Delete button */
    deleteBtn: {
      position: 'absolute',
      top: 0,
      right: 0,
      padding: 4,
    },

    /* Shared banner */
    sharedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: spacing.md,
      paddingVertical: 7,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
      backgroundColor: colors.bgHover,
    },
    sharedBannerText: { fontSize: 12, color: colors.textMuted },
    sharedBannerClub: { color: colors.text, fontWeight: '500' },

    /* Card body: date badge + content side by side */
    cardBody: {
      flexDirection: 'row',
      padding: spacing.md,
      gap: 12,
    },

    /* Date badge */
    dateBadge: {
      width: 44,
      alignItems: 'center',
      paddingTop: 2,
      flexShrink: 0,
    },
    dateBadgeMonth: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.accent,
      letterSpacing: 0.5,
    },
    dateBadgeDay: {
      fontSize: 26,
      fontWeight: '700',
      color: colors.text,
      lineHeight: 30,
      letterSpacing: -0.5,
    },

    /* Card content */
    cardContent: { flex: 1, gap: 6 },
    eventTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      lineHeight: 22,
      letterSpacing: -0.2,
    },
    eventDesc: {
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 18,
    },

    /* Meta */
    metaRow: { gap: 4, marginTop: 2 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    metaText: { fontSize: 12, color: colors.textMuted, flex: 1 },

    /* Friends going */
    friendsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: spacing.md,
      paddingBottom: 10,
    },
    friendsText: {
      fontSize: 12,
      color: colors.accent,
      fontWeight: '500',
      flex: 1,
    },

    /* Divider */
    cardDivider: {
      height: 1,
      backgroundColor: colors.borderSubtle,
    },

    /* Footer */
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    authorName: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '500',
    },
    footerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    goingCount: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '500',
    },
    shareBtn: {
      padding: 4,
    },
    rsvpBtn: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.accent,
      minWidth: 60,
      alignItems: 'center',
    },
    rsvpBtnGoing: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    rsvpBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.accent,
    },
    rsvpBtnTextGoing: {
      color: colors.bg,
    },

    /* Empty */
    empty: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 48,
      gap: 8,
    },
    emptyIcon: {
      width: 52,
      height: 52,
      borderRadius: radius.md,
      backgroundColor: colors.bgHover,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 4,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    emptyText: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
    },
  });
}
