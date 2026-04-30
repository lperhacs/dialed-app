import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, Modal, Pressable,
  TextInput, ScrollView, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api, { invalidateCache } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import BadgeChip, { getBadgeInfo } from '../components/BadgeChip';
import PostCard from '../components/PostCard';
import StreakBadge from '../components/StreakBadge';
import HabitCalendar from '../components/HabitCalendar';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

export default function ProfileScreen({ route, routeUsername, isOwn }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const editStyles = makeEditStyles(colors);
  const { user: me, logout } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // username can come from route params OR the tab wrapper prop
  const username = route?.params?.username ?? routeUsername ?? me?.username;

  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [habits, setHabits] = useState([]);
  const [tab, setTab] = useState('posts');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [featuringHabitId, setFeaturingHabitId] = useState(null);
  const [allBadges, setAllBadges] = useState([]);
  const [earnedBadges, setEarnedBadges] = useState([]);
  const [selectedBadge, setSelectedBadge] = useState(null);
  const [badgePopup, setBadgePopup] = useState(null);
  const [pinning, setPinning] = useState(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [buddyStatus, setBuddyStatus] = useState('none'); // 'none' | 'pending' | 'active'
  const [buddyData, setBuddyData] = useState(null); // for own profile
  const [buddyLoading, setBuddyLoading] = useState(false);

  const isSelf = me?.username === username;

  const load = useCallback(async () => {
    const [p, pp, ph] = await Promise.all([
      api.get(`/users/${username}`),
      api.get(`/users/${username}/posts`),
      api.get(`/users/${username}/habits`),
    ]);
    setProfile(p.data);
    setPosts(pp.data);
    setHabits(ph.data);
    setFollowing(p.data.is_following);
    api.get(`/users/${username}/badges`)
      .then(r => { setAllBadges(r.data.all || []); setEarnedBadges(r.data.earned || []); })
      .catch(() => {});
    // Buddy data
    if (me?.username === username) {
      api.get('/buddies').then(r => setBuddyData(r.data)).catch(() => {});
    } else {
      api.get(`/buddies/status/${p.data.id}`)
        .then(r => setBuddyStatus(r.data.status))
        .catch(() => {});
    }
  }, [username]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().catch(() => {}).finally(() => setLoading(false));
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const reloadBadges = () => {
    api.get(`/users/${username}/badges`)
      .then(r => {
        setAllBadges(r.data.all || []);
        setEarnedBadges(r.data.earned || []);
        setProfile(p => p ? { ...p, badges: (r.data.earned || []).filter(b => b.pinned).slice(0, 1) } : p);
      })
      .catch(() => {});
  };

  const togglePin = async (badge) => {
    setPinning(badge.id);
    try {
      await api.patch(`/users/profile/badges/${badge.id}/pin`);
      invalidateCache(`/users/${username}`);
      reloadBadges();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not update badge');
    } finally {
      setPinning(null);
    }
  };

  const setFeaturedHabit = async (habitId) => {
    const isAlreadyFeatured = profile.featured_streak?.habit_id === habitId;
    setFeaturingHabitId(habitId);
    try {
      await api.patch('/users/profile/featured-habit', { habit_id: isAlreadyFeatured ? null : habitId });
      await load();
    } finally {
      setFeaturingHabitId(null);
    }
  };

  const openMessage = async () => {
    try {
      const { data } = await api.post('/dm/conversations', { user_id: profile.id });
      navigation.navigate('Conversation', { conversationId: data.id, other: { id: profile.id, username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url } });
    } catch {
      Alert.alert('Error', 'Could not open conversation');
    }
  };

  const toggleFollow = async () => {
    setFollowLoading(true);
    try {
      if (following) {
        await api.delete(`/users/${profile.id}/follow`);
        setFollowing(false);
        setProfile(p => ({ ...p, follower_count: p.follower_count - 1 }));
      } else {
        await api.post(`/users/${profile.id}/follow`);
        setFollowing(true);
        setProfile(p => ({ ...p, follower_count: p.follower_count + 1 }));
      }
      // Bust the cached profile so a refresh returns fresh is_following state
      invalidateCache(`/users/${username}`);
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingTop: insets.top }]}>
        <Text style={{ color: colors.textMuted }}>User not found</Text>
      </View>
    );
  }

  // The full header (avatar, name, bio, stats, badges, tabs) rendered as FlatList header
  const ListHeader = (
    <View>
      {/* Profile header area */}
      <View style={[styles.profileHeader, { paddingTop: 12 }]}>
        {/* Avatar row */}
        <View style={styles.topRow}>
          <Avatar user={profile} size="xl" />
        </View>

        {/* Name + handle */}
        <Text style={styles.displayName}>{profile.display_name}</Text>
        <Text style={styles.username}>@{profile.username}</Text>
        {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
        {!!profile.featured_streak && profile.featured_streak.streak > 0 && (
          <View style={styles.featuredStreak}>
            <Text style={styles.featuredStreakText}>
              {profile.display_name} is on a{' '}
              <Text style={styles.featuredStreakCount}>{profile.featured_streak.streak} day</Text>
              {' '}{profile.featured_streak.habit_name} streak
            </Text>
          </View>
        )}

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{profile.post_count}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <TouchableOpacity
            style={styles.stat}
            onPress={() => navigation.navigate('FollowList', { username, type: 'followers' })}
            activeOpacity={0.7}
          >
            <Text style={styles.statNum}>{profile.follower_count}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.stat}
            onPress={() => navigation.navigate('FollowList', { username, type: 'following' })}
            activeOpacity={0.7}
          >
            <Text style={styles.statNum}>{profile.following_count}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </TouchableOpacity>
        </View>

        {/* Action buttons - below stats */}
        {isSelf ? (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, { flex: 1 }]} onPress={() => setEditModalVisible(true)} activeOpacity={0.8}>
              <Text style={styles.actionBtnText}>Edit Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtnIcon} onPress={() => logout()} activeOpacity={0.8}>
              <Ionicons name="log-out-outline" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtnFilled, { flex: 1 }, following && styles.actionBtnOutline]}
              onPress={toggleFollow}
              disabled={followLoading}
              activeOpacity={0.85}
            >
              <Text style={[styles.actionBtnFilledText, following && { color: colors.text }]}>
                {following ? 'Unfollow' : 'Follow'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.actionBtnFilled, { flex: 1 },
                buddyStatus === 'active'
                  ? { backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accent }
                  : { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
                buddyStatus === 'pending' && { opacity: 0.6 },
              ]}
              disabled={buddyLoading || buddyStatus === 'pending' || buddyStatus === 'active'}
              onPress={async () => {
                setBuddyLoading(true);
                try {
                  await api.post('/buddies/request', { user_id: profile.id });
                  setBuddyStatus('pending');
                } catch (err) {
                  Alert.alert('Buddy', err.response?.data?.error || 'Could not send request');
                } finally {
                  setBuddyLoading(false);
                }
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.actionBtnFilledText, { color: buddyStatus === 'active' ? colors.accent : colors.text }]}>
                {buddyStatus === 'active' ? 'Buddies' : buddyStatus === 'pending' ? 'Requested' : 'Buddy up'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtnIcon} onPress={openMessage} activeOpacity={0.85}>
              <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Buddy card */}
      {isSelf && buddyData && (
        <View style={styles.buddyCard}>
          <Ionicons name="people-outline" size={16} color={colors.accent} />
          {buddyData.buddy ? (
            <View style={{ flex: 1 }}>
              <Text style={styles.buddyName}>
                Buddy: <Text style={{ color: colors.text }}>{buddyData.buddy.display_name}</Text>
              </Text>
              <Text style={styles.buddyMeta}>
                {buddyData.buddy.habits.filter(h => h.logged_today > 0).length}/{buddyData.buddy.habits.length} habits logged today
              </Text>
            </View>
          ) : (
            <Text style={styles.buddyMeta}>No buddy yet - tap "Buddy up" on someone's profile</Text>
          )}
          {buddyData.pending_requests?.length > 0 && (
            <TouchableOpacity
              style={styles.buddyRequestBtn}
              onPress={() => {
                const req = buddyData.pending_requests[0];
                Alert.alert(
                  'Buddy Request',
                  `${req.from_display_name} wants to be your accountability buddy.`,
                  [
                    { text: 'Decline', style: 'cancel', onPress: () => api.delete(`/buddies/${req.id}`).then(() => setBuddyData(d => ({ ...d, pending_requests: [] }))) },
                    { text: 'Accept', onPress: () => api.put(`/buddies/${req.id}/accept`).then(() => api.get('/buddies').then(r => setBuddyData(r.data))) },
                  ]
                );
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.buddyRequestText}>{buddyData.pending_requests.length} request</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Buddy card - other user's profile (only shown when backend returns buddy_info) */}
      {!isSelf && profile?.buddy_info && (
        <TouchableOpacity
          style={styles.buddyCard}
          onPress={() => navigation.push('UserProfile', { username: profile.buddy_info.username })}
          activeOpacity={0.8}
        >
          <Ionicons name="people-outline" size={16} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.buddyName}>
              Buddy: <Text style={{ color: colors.text }}>{profile.buddy_info.display_name}</Text>
            </Text>
            <Text style={styles.buddyMeta}>@{profile.buddy_info.username}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
        </TouchableOpacity>
      )}

      {/* Pinned badges */}
      {profile.badges?.length > 0 && (
        <View style={styles.pinnedBadgesRow}>
          {profile.badges.map(b => (
            <TouchableOpacity key={b.id} onPress={() => setBadgePopup(b)} activeOpacity={0.75}>
              <BadgeChip badgeType={b.badge_type} pinned />
            </TouchableOpacity>
          ))}
        </View>
      )}


      {/* Tab switcher */}
      <View style={styles.tabRow}>
        {['posts', 'habits', 'badges'].map(t => (
          <TouchableOpacity key={t} onPress={() => { setTab(t); setSelectedBadge(null); }} style={styles.tabBtn}>
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
            {tab === t && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Badges tab content - inline so it scrolls with FlatList */}
      {tab === 'badges' && (() => {
        const pool = isSelf ? allBadges : allBadges.filter(b => b.earned || earnedBadges.some(e => e.badge_type === b.type));
        const groups = [
          { label: 'Daily',   badges: pool.filter(b => b.type.startsWith('day_') || b.type.startsWith('year_')) },
          { label: 'Weekly',  badges: pool.filter(b => b.type.startsWith('week_')) },
          { label: 'Monthly', badges: pool.filter(b => b.type.startsWith('month_')) },
          { label: 'Other',   badges: pool.filter(b => !b.type.startsWith('day_') && !b.type.startsWith('year_') && !b.type.startsWith('week_') && !b.type.startsWith('month_')) },
        ].filter(g => g.badges.length > 0);

        if (groups.length === 0) {
          return (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No badges yet</Text>
              <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>Keep up your streaks to earn badges.</Text>
            </View>
          );
        }

        return (
          <View style={{ padding: spacing.lg, gap: 20 }}>
            {groups.map(({ label, badges }) => (
              <View key={label}>
                <Text style={styles.badgeGroupLabel}>{label}</Text>
                <View style={styles.badgeChips}>
                  {badges.map(b => {
                    const info = getBadgeInfo(b.type);
                    const dbBadge = earnedBadges.find(e => e.badge_type === b.type);
                    const isEarned = b.earned || !!dbBadge;
                    return (
                      <TouchableOpacity
                        key={b.type}
                        onPress={() => setSelectedBadge(b)}
                        activeOpacity={0.75}
                        style={[
                          styles.badgePill,
                          isEarned ? (dbBadge?.pinned ? styles.badgePillPinned : styles.badgePillEarned) : styles.badgePillLocked,
                        ]}
                      >
                        <Text style={[styles.badgePillText, isEarned ? (dbBadge?.pinned ? styles.badgePillTextPinned : styles.badgePillTextEarned) : styles.badgePillTextLocked]}>
                          {info.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        );
      })()}
    </View>
  );

  const renderItem = tab === 'posts'
    ? ({ item }) => <PostCard post={item} onDelete={id => setPosts(p => p.filter(x => x.id !== id))} />
    : ({ item: h }) => {
        const isFeatured = profile?.featured_streak?.habit_id === h.id;
        return (
          <View style={[styles.habitCard, { borderLeftColor: h.color }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Text style={styles.habitName}>{h.name}</Text>
              <StreakBadge streak={h.streak} atRisk={h.at_risk} />
              {isSelf && (
                <TouchableOpacity
                  style={[styles.featureBtn, isFeatured && styles.featureBtnActive]}
                  onPress={() => setFeaturedHabit(h.id)}
                  disabled={featuringHabitId !== null}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.featureBtnText, isFeatured && styles.featureBtnTextActive]}>
                    {isFeatured ? 'Pinned' : 'Pin'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {!!h.description && <Text style={styles.habitDesc}>{h.description}</Text>}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 10 }}>
              <Text style={styles.habitMeta}>{h.frequency}</Text>
              <Text style={styles.habitMeta}>{h.total_logs} logs</Text>
            </View>
            <HabitCalendar calendar={h.calendar || []} color={h.color} compact />
          </View>
        );
      };

  const listData = tab === 'posts' ? posts : tab === 'habits' ? habits : [];

  return (
    <View style={[styles.container, { paddingTop: isOwn ? 0 : insets.top }]}>
      {isOwn && (
        <View style={[styles.ownHeader, { paddingTop: insets.top }]}>
          <Text style={styles.ownHeaderTitle}>Profile</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} hitSlop={10}>
            <Ionicons name="settings-outline" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={listData}
        extraData={[following, followLoading, buddyStatus, buddyLoading, tab]}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListHeaderComponent={ListHeader}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={
          tab !== 'badges'
            ? <View style={styles.empty}><Text style={styles.emptyTitle}>No {tab} yet</Text></View>
            : null
        }
      />

      {/* Badge tab detail popup */}
      <Modal visible={!!selectedBadge} transparent animationType="fade" onRequestClose={() => setSelectedBadge(null)}>
        <Pressable style={styles.popupOverlay} onPress={() => setSelectedBadge(null)}>
          <Pressable style={styles.popupCard} onPress={() => {}}>
            {selectedBadge && (() => {
              const info = getBadgeInfo(selectedBadge.type);
              const dbBadge = earnedBadges.find(e => e.badge_type === selectedBadge.type);
              return (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={styles.popupLabel}>{info.label}</Text>
                    <TouchableOpacity onPress={() => setSelectedBadge(null)} hitSlop={10}>
                      <Text style={{ color: colors.textMuted, fontSize: 18, lineHeight: 20 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.popupDesc}>{info.desc}</Text>
                  {(selectedBadge.habit_name || dbBadge?.habit_name) && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                      <View style={[styles.habitDot, { backgroundColor: selectedBadge.habit_color || dbBadge?.habit_color || colors.accent }]} />
                      <Text style={styles.badgeInfoHabit}>Earned on {selectedBadge.habit_name || dbBadge?.habit_name}</Text>
                    </View>
                  )}
                  {isSelf && dbBadge && (
                    <TouchableOpacity
                      style={[styles.pinBtn, dbBadge.pinned && styles.pinBtnActive, { marginTop: 16, justifyContent: 'center', paddingVertical: 10 }]}
                      onPress={() => { togglePin(dbBadge); setSelectedBadge(null); }}
                      disabled={pinning === dbBadge.id}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.pinBtnText, dbBadge.pinned && styles.pinBtnTextActive]}>
                        {dbBadge.pinned ? 'Unpin from profile' : 'Pin to profile'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Pinned badge info popup */}
      <Modal visible={!!badgePopup} transparent animationType="fade" onRequestClose={() => setBadgePopup(null)}>
        <Pressable style={styles.popupOverlay} onPress={() => setBadgePopup(null)}>
          <Pressable style={styles.popupCard} onPress={() => {}}>
            {badgePopup && (() => {
              const info = getBadgeInfo(badgePopup.badge_type);
              return (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={styles.popupLabel}>{info.label}</Text>
                    <TouchableOpacity onPress={() => setBadgePopup(null)} hitSlop={10}>
                      <Text style={{ color: colors.textMuted, fontSize: 18, lineHeight: 20 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.popupDesc}>{info.desc}</Text>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit Profile Modal */}
      {isSelf && profile && (
        <EditProfileModal
          visible={editModalVisible}
          profile={profile}
          onClose={() => setEditModalVisible(false)}
          onSaved={(updated) => {
            setProfile(p => ({ ...p, ...updated }));
            setEditModalVisible(false);
          }}
        />
      )}
    </View>
  );
}

function EditProfileModal({ visible, profile, onClose, onSaved }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const editStyles = makeEditStyles(colors);
  const { updateUser } = useAuth();
  const [displayName, setDisplayName] = useState(profile.display_name || '');
  const [username, setUsername] = useState(profile.username || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [avatarUri, setAvatarUri] = useState(null); // local picked image for preview
  const [avatarBase64, setAvatarBase64] = useState(null); // base64 for upload
  const [saving, setSaving] = useState(false);

  // Reset fields when modal opens
  React.useEffect(() => {
    if (visible) {
      setDisplayName(profile.display_name || '');
      setUsername(profile.username || '');
      setBio(profile.bio || '');
      setAvatarUri(null);
      setAvatarBase64(null);
    }
  }, [visible]);

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access to change your avatar.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.35,
      base64: true,
    });
    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri);
      setAvatarBase64(result.assets[0].base64 || null);
    }
  };

  const save = async () => {
    if (!displayName.trim()) { Alert.alert('Name required'); return; }
    if (!username.trim()) { Alert.alert('Username required'); return; }
    setSaving(true);
    try {
      let latestAvatarUrl = profile.avatar_url;

      // Upload avatar as base64 if a new one was picked
      if (avatarBase64) {
        const dataUrl = `data:image/jpeg;base64,${avatarBase64}`;
        const { data: avatarData } = await api.patch('/users/me/avatar', { avatar_data: dataUrl });
        latestAvatarUrl = avatarData.avatar_url;
      }

      // Save name, username, bio
      const formData = new FormData();
      formData.append('display_name', displayName.trim());
      formData.append('username', username.trim().toLowerCase());
      formData.append('bio', bio);
      const { data } = await api.put('/users/profile', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

      const merged = { ...data, avatar_url: latestAvatarUrl };
      updateUser?.(merged);
      onSaved(merged);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  const { API_BASE_URL } = require('../theme');
  const rawUrl = profile.avatar_url;
  const resolvedAvatar = rawUrl
    ? (rawUrl.startsWith('http') || rawUrl.startsWith('data:') ? rawUrl : `${API_BASE_URL}${rawUrl}`)
    : null;
  const avatarDisplay = avatarUri || resolvedAvatar;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={editStyles.container}>
        <View style={editStyles.header}>
          <TouchableOpacity onPress={onClose}><Text style={{ color: colors.textMuted, fontSize: 15 }}>Cancel</Text></TouchableOpacity>
          <Text style={editStyles.title}>Edit Profile</Text>
          <TouchableOpacity onPress={save} disabled={saving}>
            <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '700' }}>{saving ? '…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={editStyles.body} keyboardShouldPersistTaps="handled">
          {/* Avatar picker */}
          <TouchableOpacity style={editStyles.avatarWrap} onPress={pickAvatar} activeOpacity={0.8}>
            {avatarDisplay ? (
              <Image source={{ uri: avatarDisplay }} style={editStyles.avatarImg} />
            ) : (
              <View style={[editStyles.avatarImg, { backgroundColor: colors.bgHover, justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name="person" size={40} color={colors.textMuted} />
              </View>
            )}
            <View style={editStyles.avatarOverlay}>
              <Ionicons name="camera" size={18} color="white" />
            </View>
          </TouchableOpacity>
          <Text style={editStyles.avatarHint}>Tap to change photo</Text>

          {[
            { label: 'DISPLAY NAME', value: displayName, onChange: setDisplayName, placeholder: 'Your name' },
            { label: 'USERNAME', value: username, onChange: setUsername, placeholder: 'username', autoCapitalize: 'none' },
          ].map(({ label, value, onChange, placeholder, autoCapitalize }) => (
            <View key={label} style={editStyles.field}>
              <Text style={editStyles.fieldLabel}>{label}</Text>
              <TextInput
                style={editStyles.input}
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                placeholderTextColor={colors.textDim}
                autoCapitalize={autoCapitalize || 'words'}
              />
            </View>
          ))}

          <View style={editStyles.field}>
            <Text style={editStyles.fieldLabel}>BIO</Text>
            <TextInput
              style={[editStyles.input, { minHeight: 80, textAlignVertical: 'top' }]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell people about yourself…"
              placeholderTextColor={colors.textDim}
              multiline
              maxLength={160}
            />
            <Text style={editStyles.charCount}>{bio.length}/160</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function makeEditStyles(colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingTop: 20, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  body: { padding: spacing.lg, alignItems: 'center', gap: 20 },
  avatarWrap: { position: 'relative', marginBottom: 4 },
  avatarImg: { width: 90, height: 90, borderRadius: 45 },
  avatarOverlay: { position: 'absolute', bottom: 0, right: 0, backgroundColor: colors.accent, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  avatarHint: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  field: { width: '100%', gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  input: { backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text, fontSize: 15, paddingHorizontal: 14, paddingVertical: 11 },
  charCount: { fontSize: 11, color: colors.textDim, alignSelf: 'flex-end' },
  });
}

function makeStyles(colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  ownHeader: {
    backgroundColor: colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  ownHeaderTitle: { fontSize: 20, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  profileHeader: { paddingHorizontal: spacing.lg, paddingBottom: 16 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  actionBtnFilled: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  actionBtnFilledText: { color: colors.bg, fontWeight: '600', fontSize: 14 },
  actionBtnOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 14 },
  actionBtnText: { color: colors.textMuted, fontWeight: '500', fontSize: 14 },
  actionBtnIcon: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  displayName: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 2 },
  username: { fontSize: 13, color: colors.textMuted, marginBottom: 8 },
  bio: { fontSize: 14, color: colors.text, lineHeight: 20, marginBottom: 8 },
  featuredStreak: {
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentDimBorder,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 14,
    alignSelf: 'flex-start',
  },
  featuredStreakText: { fontSize: 13, color: colors.text, lineHeight: 18 },
  featuredStreakCount: { fontWeight: '600', color: colors.accent },
  statsRow: { flexDirection: 'row', gap: 24, alignItems: 'center' },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted },
  pinnedBadgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: spacing.lg, paddingTop: 8, paddingBottom: 4 },
  badgeGroupLabel: { fontSize: 11, fontWeight: '500', color: colors.textMuted, marginBottom: 8 },
  badgeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badgeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.xs, backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.borderSubtle },
  badgeChipEarned: { backgroundColor: colors.bgHover, borderColor: colors.border },
  badgeChipSelected: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  badgeChipText: { fontSize: 12, fontWeight: '500', color: colors.textDim },
  badgeInfo: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, backgroundColor: colors.bgCard, borderRadius: radius.md, borderLeftWidth: 3, marginTop: 4 },
  badgeInfoLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  badgeInfoDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  badgeInfoHabit: { fontSize: 12, color: colors.textDim },
  habitDot: { width: 7, height: 7, borderRadius: 4 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: 'transparent' },
  badgeRowPinned: { borderColor: colors.accent },
  badgeRowLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  badgeRowDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  badgePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.xs, borderWidth: 1 },
  badgePillEarned: { backgroundColor: colors.accent, borderColor: colors.accent },
  badgePillPinned: { backgroundColor: colors.accent, borderColor: colors.bg, borderWidth: 2 },
  badgePillLocked: { backgroundColor: colors.bgHover, borderColor: colors.borderSubtle, opacity: 0.35 },
  badgePillText: { fontSize: 11, fontWeight: '500' },
  badgePillTextEarned: { color: colors.bg },
  badgePillTextPinned: { color: colors.bg },
  badgePillTextLocked: { color: colors.textDim },
  pinBtn: { borderWidth: 1, borderColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 5, minWidth: 64, alignItems: 'center' },
  pinBtnActive: { backgroundColor: colors.accent },
  pinBtnText: { fontSize: 12, fontWeight: '600', color: colors.accent },
  pinBtnTextActive: { color: colors.bg },
  popupOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  popupCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg, width: '100%', maxWidth: 320 },
  popupLabel: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1, marginRight: 8 },
  popupDesc: { fontSize: 13, color: colors.textMuted, marginTop: 8 },
  buddyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: spacing.lg, marginBottom: 12,
    backgroundColor: colors.bgCard, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  buddyName: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  buddyMeta: { fontSize: 12, color: colors.textDim, marginTop: 1, flex: 1 },
  buddyRequestBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.xs, backgroundColor: colors.accentDim,
    borderWidth: 1, borderColor: colors.accentDimBorder,
  },
  buddyRequestText: { fontSize: 11, fontWeight: '600', color: colors.accent },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, position: 'relative' },
  tabLabel: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  tabLabelActive: { color: colors.text, fontWeight: '600' },
  tabIndicator: { position: 'absolute', bottom: 0, height: 2, width: '35%', backgroundColor: colors.accent, borderRadius: 1 },
  habitCard: {
    marginHorizontal: spacing.lg,
    marginVertical: 6,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderLeftWidth: 3,
  },
  featureBtn: {
    marginLeft: 'auto',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xs,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  featureBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  featureBtnText: { fontSize: 11, fontWeight: '500', color: colors.textMuted },
  featureBtnTextActive: { color: colors.accent },
  habitName: { fontSize: 15, fontWeight: '600', color: colors.text },
  habitDesc: { fontSize: 13, color: colors.textMuted, marginBottom: 6 },
  habitMeta: { fontSize: 11, color: colors.textDim, textTransform: 'capitalize' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.textMuted },
  });
}
