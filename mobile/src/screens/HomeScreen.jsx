import React, { useState, useCallback } from 'react';
import {
  View, FlatList, TouchableOpacity, Text, StyleSheet,
  ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import PostCard from '../components/PostCard';
import EventsScreen from './EventsScreen';
import { spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useBadges } from '../context/BadgeContext';

const LOGO_DARK  = require('../../assets/logo-white.png');
const LOGO_LIGHT = require('../../assets/logo-black.png');

function EmptyFeed({ tab }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Nothing here yet</Text>
      <Text style={styles.emptyText}>
        {tab === 'following'
          ? 'Follow people to see their posts here, or check out Events.'
          : 'Nothing to explore yet. Be the first to post!'}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const { notifCount, msgCount } = useBadges();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('following');
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPosts = useCallback(async (p = 1, t = tab, reset = false) => {
    const endpoint = t === 'following' ? `/posts?page=${p}` : `/posts/explore?page=${p}`;
    try {
      const { data } = await api.get(endpoint);
      if (reset) setPosts(data);
      else setPosts(prev => [...prev, ...data]);
      setHasMore(data.length === 20);
      setPage(p);
    } catch {
      // silent
    }
  }, [tab]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchPosts(1, tab, true).finally(() => setLoading(false));
    }, [tab])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPosts(1, tab, true);
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await fetchPosts(page + 1, tab);
    setLoadingMore(false);
  };

  const switchTab = t => {
    if (t !== tab) { setTab(t); setPosts([]); setPage(1); setHasMore(true); }
  };

  const renderPost = ({ item }) => (
    <PostCard post={item} onDelete={id => setPosts(p => p.filter(x => x.id !== id))} />
  );

  const TabBar = (
    <View style={styles.tabRow}>
      {['following', 'events'].map(t => (
        <TouchableOpacity key={t} onPress={() => switchTab(t)} style={styles.tabBtn} activeOpacity={0.7}>
          <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
            {t === 'following' ? 'Pulse Check' : 'Events'}
          </Text>
          {tab === t && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Image
          source={isDark ? LOGO_DARK : LOGO_LIGHT}
          style={styles.headerLogo}
          resizeMode="contain"
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity onPress={() => navigation.navigate('Search')} hitSlop={10}>
            <Ionicons name="search-outline" size={24} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('WeeklyRecap')} hitSlop={10}>
            <Ionicons name="bar-chart-outline" size={24} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Inbox')} hitSlop={10}>
            <View>
              <Ionicons
                name={msgCount > 0 ? 'mail' : 'mail-outline'}
                size={24}
                color={msgCount > 0 ? colors.accent : colors.textMuted}
              />
              {msgCount > 0 && (
                <View style={styles.iconBadge}>
                  <Text style={styles.iconBadgeText}>{msgCount > 9 ? '9+' : msgCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Notifications')} hitSlop={10}>
            <View>
              <Ionicons
                name={notifCount > 0 ? 'notifications' : 'notifications-outline'}
                size={24}
                color={notifCount > 0 ? colors.accent : colors.textMuted}
              />
              {notifCount > 0 && (
                <View style={styles.iconBadge}>
                  <Text style={styles.iconBadgeText}>{notifCount > 9 ? '9+' : notifCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Normal feed */}
      {(
        <>
          {TabBar}
          {tab === 'events' ? (
            <EventsScreen />
          ) : loading && posts.length === 0 ? (
            <View style={styles.loadingCenter}>
              <ActivityIndicator color={colors.accent} size="large" />
            </View>
          ) : (
            <FlatList
              data={posts}
              renderItem={renderPost}
              keyExtractor={item => String(item.id)}
              ListHeaderComponent={null}
              ListEmptyComponent={!loading ? <EmptyFeed tab={tab} /> : null}
              ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.accent} style={{ padding: 20 }} /> : null}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={colors.accent}
                />
              }
              onEndReached={loadMore}
              onEndReachedThreshold={0.4}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={posts.length === 0 ? { flex: 1 } : undefined}
            />
          )}
        </>
      )}
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
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerLogo: { width: 36, height: 36 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, position: 'relative' },
  tabLabel: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  tabLabelActive: { color: colors.text, fontWeight: '600' },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    width: '40%',
    backgroundColor: colors.accent,
    borderRadius: 1,
  },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 6 },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
  iconBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  iconBadgeText: { color: '#fff', fontSize: 8, fontWeight: '700', lineHeight: 10 },
  });
}
