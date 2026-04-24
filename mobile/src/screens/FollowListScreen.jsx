import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import api from '../api/client';
import Avatar from '../components/Avatar';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

export default function FollowListScreen({ route }) {
  const { username, type } = route.params; // type: 'followers' | 'following'
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/users/${username}/${type}`)
      .then(r => setUsers(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [username, type]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={users}
      keyExtractor={item => item.id.toString()}
      contentContainerStyle={{ padding: spacing.md }}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('UserProfile', { username: item.username })}
          activeOpacity={0.75}
        >
          <Avatar user={item} size="md" />
          <View style={styles.info}>
            <Text style={styles.displayName}>{item.display_name}</Text>
            <Text style={styles.handle}>@{item.username}</Text>
          </View>
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.empty}>
            {type === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
          </Text>
        </View>
      }
    />
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    info: { flex: 1 },
    displayName: { fontSize: 15, fontWeight: '600', color: colors.text },
    handle: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
    empty: { fontSize: 14, color: colors.textMuted },
  });
}
