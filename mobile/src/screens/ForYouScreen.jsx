import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

import { timeAgo } from '../utils/timeAgo';

function PostPage({ post }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { user } = useAuth();
  const navigation = useNavigation();
  const [liked, setLiked] = useState(!!post.liked_by_me);
  const [likeCount, setLikeCount] = useState(post.like_count || 0);
  const [commentCount] = useState(post.comment_count || 0);

  const toggleLike = async () => {
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount(c => wasLiked ? c - 1 : c + 1);
    try {
      if (wasLiked) {
        const { data } = await api.delete(`/posts/${post.id}/like`);
        setLikeCount(data.like_count);
      } else {
        const { data } = await api.post(`/posts/${post.id}/like`);
        setLikeCount(data.like_count);
      }
    } catch {
      setLiked(wasLiked);
      setLikeCount(c => wasLiked ? c + 1 : c - 1);
    }
  };

  return (
    <View style={styles.page}>
      {/* Left: content */}
      <View style={styles.pageLeft}>
        <TouchableOpacity
          style={styles.userRow}
          onPress={() => navigation.navigate('UserProfile', { username: post.username })}
          activeOpacity={0.85}
        >
          <Avatar user={post} size="md" />
          <View style={{ flex: 1 }}>
            <Text style={styles.displayName}>{post.display_name}</Text>
            <Text style={styles.username}>@{post.username} · {timeAgo(post.created_at)}</Text>
          </View>
        </TouchableOpacity>

        {post.habit_name ? (
          <View style={[styles.habitTag, { borderColor: post.habit_color || colors.accent }]}>
            <Text style={[styles.habitTagText, { color: post.habit_color || colors.accent }]}>
              Day {post.habit_day} · {post.habit_name}
            </Text>
          </View>
        ) : null}

        {!!post.content && (
          <Text style={styles.content} numberOfLines={6}>{post.content}</Text>
        )}
      </View>

      {/* Right rail: actions */}
      <View style={styles.rail}>
        <TouchableOpacity style={styles.railBtn} onPress={toggleLike} activeOpacity={0.7}>
          <Text style={[styles.railIcon, liked && { color: colors.accent }]}>{liked ? '♥' : '♡'}</Text>
          <Text style={styles.railCount}>{likeCount > 0 ? likeCount : ''}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.railBtn}
          onPress={() => navigation.navigate('Comments', { postId: post.id })}
          activeOpacity={0.7}
        >
          <Text style={styles.railIcon}>○</Text>
          <Text style={styles.railCount}>{commentCount > 0 ? commentCount : ''}</Text>
        </TouchableOpacity>

        {user?.id !== post.user_id && (
          <TouchableOpacity
            style={styles.railBtn}
            onPress={() => navigation.navigate('UserProfile', { username: post.username })}
            activeOpacity={0.7}
          >
            <Avatar user={post} size="xs" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function GroupsPage({ challenges }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();

  return (
    <View style={[styles.page, styles.groupsPage]}>
      <Text style={styles.groupsHeading}>Groups on the Pulse</Text>
      <Text style={styles.groupsSub}>Based on your habits and activity</Text>

      <View style={styles.groupsList}>
        {challenges.map(c => (
          <TouchableOpacity
            key={c.id}
            style={styles.groupRow}
            onPress={() => navigation.navigate('ClubDetail', { id: c.id })}
            activeOpacity={0.8}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.groupName}>{c.name}</Text>
              <Text style={styles.groupMeta}>
                {c.frequency} · {c.member_count} members
              </Text>
              {!!c.description && (
                <Text style={styles.groupDesc} numberOfLines={2}>{c.description}</Text>
              )}
            </View>
            <View style={styles.groupJoinBtn}>
              <Text style={styles.groupJoinText}>View</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function ForYouScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef(null);

  const load = useCallback(async () => {
    const [postsRes, groupsRes] = await Promise.all([
      api.get('/posts/for-you'),
      api.get('/clubs/recommended').catch(() => ({ data: [] })),
    ]);

    const posts = postsRes.data;
    const groups = groupsRes.data;

    // Intersperse groups card every 5 posts + one random club injection
    const feed = [];
    const randomClubPos = posts.length > 3 ? Math.floor(Math.random() * (posts.length - 2)) + 1 : -1;
    posts.forEach((post, i) => {
      feed.push({ type: 'post', id: post.id, data: post });

      // Random single-club injection at a surprise position
      if (i === randomClubPos && groups.length > 0) {
        const randomClub = groups[Math.floor(Math.random() * groups.length)];
        feed.push({ type: 'groups', id: `random-club-${i}`, data: [randomClub] });
      }

      // Regular grouped card every 5 posts
      if ((i + 1) % 5 === 0 && groups.length > 0) {
        const offset = Math.floor(i / 5) * 3;
        const slice = groups.slice(offset % groups.length, (offset % groups.length) + 3);
        if (slice.length > 0) {
          feed.push({ type: 'groups', id: `groups-${i}`, data: slice });
        }
      }
    });

    setItems(feed);
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().catch(() => {}).finally(() => setLoading(false));
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Nothing yet</Text>
        <Text style={styles.emptySub}>Start following people and logging habits to personalise this feed.</Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={listRef}
      data={items}
      keyExtractor={item => item.id}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      contentContainerStyle={{ paddingBottom: 40 }}
      renderItem={({ item }) =>
        item.type === 'post'
          ? <PostPage post={item.data} />
          : <GroupsPage challenges={item.data} />
      }
    />
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center', padding: 40, backgroundColor: colors.bg },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  // Post page
  page: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    minHeight: 160,
  },
  pageLeft: {
    flex: 1,
    padding: spacing.lg,
    paddingVertical: spacing.xl,
    gap: 10,
  },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  displayName: { fontSize: 15, fontWeight: '700', color: colors.text },
  username: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  habitTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  habitTagText: { fontSize: 12, fontWeight: '600' },
  content: { fontSize: 16, color: colors.text, lineHeight: 24 },

  // Right rail
  rail: {
    width: 64,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    paddingVertical: spacing.xl,
    paddingRight: spacing.md,
  },
  railBtn: { alignItems: 'center', gap: 4 },
  railIcon: { fontSize: 26, color: colors.text },
  railCount: { fontSize: 12, fontWeight: '600', color: colors.textMuted },

  // Groups page
  groupsPage: {
    flexDirection: 'column',
    padding: spacing.xl,
    paddingVertical: spacing.xxl,
    backgroundColor: colors.bgCard,
  },
  groupsHeading: { fontSize: 20, fontWeight: '900', color: colors.text, marginBottom: 4, letterSpacing: -0.5 },
  groupsSub: { fontSize: 13, color: colors.textMuted, marginBottom: 24 },
  groupsList: { gap: 12 },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  groupName: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  groupMeta: { fontSize: 12, color: colors.textMuted, textTransform: 'capitalize' },
  groupDesc: { fontSize: 12, color: colors.textDim, lineHeight: 17, marginTop: 3 },
  groupJoinBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  groupJoinText: { fontSize: 13, fontWeight: '700', color: colors.accent },
  });
}
