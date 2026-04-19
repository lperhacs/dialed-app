import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Avatar from './Avatar';
import { spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

export default function MentionSuggestions({ suggestions, onSelect }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <View style={styles.container}>
      {suggestions.map(u => (
        <TouchableOpacity
          key={u.id}
          style={styles.row}
          onPress={() => onSelect(u.username)}
          activeOpacity={0.7}
        >
          <Avatar user={u} size="xs" />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{u.display_name}</Text>
            <Text style={styles.handle}>@{u.username}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    container: {
      backgroundColor: colors.bgCard,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    name: { fontSize: 14, fontWeight: '600', color: colors.text },
    handle: { fontSize: 12, color: colors.textMuted },
  });
}
