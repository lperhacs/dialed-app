import React, { useRef, useEffect } from 'react';
import { View, Text, Image, Animated, StyleSheet } from 'react-native';
import { API_BASE_URL, radius } from '../theme';
import { useTheme } from '../context/ThemeContext';

const SIZES = {
  xs:  24,
  sm:  32,
  md:  40,
  lg:  56,
  xl:  80,
};

const FONT_SIZES = { xs: 10, sm: 13, md: 16, lg: 22, xl: 30 };

function fullUrl(path) {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `${API_BASE_URL}${path}`;
}

export default function Avatar({ user, size = 'md', atRisk = false, style }) {
  const { colors } = useTheme();
  const dim = SIZES[size] || SIZES.md;
  const fontSize = FONT_SIZES[size] || 16;
  const initial = (user?.display_name || user?.username || '?')[0].toUpperCase();
  const imageUrl = fullUrl(user?.avatar_url);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!atRisk) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.35, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [atRisk]);

  const ringSize = dim + 8;

  return (
    <View style={[{ width: dim, height: dim }, style]}>
      {atRisk && (
        <Animated.View
          style={[
            styles.ring,
            {
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              top: -4,
              left: -4,
              opacity: pulseAnim,
              borderColor: colors.red,
            },
          ]}
        />
      )}

      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={[styles.image, { width: dim, height: dim, borderRadius: dim / 2, backgroundColor: colors.bgHover }]}
        />
      ) : (
        <View style={[styles.placeholder, { width: dim, height: dim, borderRadius: dim / 2, backgroundColor: colors.accentDim }]}>
          <Text style={[styles.initial, { fontSize, color: colors.accent }]}>{initial}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: {},
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initial: {
    fontWeight: '700',
  },
  ring: {
    position: 'absolute',
    borderWidth: 2.5,
    zIndex: 1,
  },
});
