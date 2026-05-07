import React, { useRef, useState } from 'react';
import {
  Modal, View, Image, TouchableOpacity, StyleSheet,
  Dimensions, StatusBar, Platform, Linking, Text,
  FlatList, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Normalise incoming props into a media array: [{type, url}]
function buildMedia(media, imageUrl, videoUrl) {
  if (media && media.length > 0) return media;
  const items = [];
  if (imageUrl) items.push({ type: 'image', url: imageUrl });
  if (videoUrl) items.push({ type: 'video', url: videoUrl });
  return items;
}

function ImagePage({ url }) {
  return (
    <ScrollView
      style={{ width: SCREEN_W, height: SCREEN_H }}
      contentContainerStyle={{ width: SCREEN_W, height: SCREEN_H }}
      maximumZoomScale={5}
      minimumZoomScale={1}
      bouncesZoom
      centerContent
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <Image
        source={{ uri: url }}
        style={pagStyles.image}
        resizeMode="contain"
      />
    </ScrollView>
  );
}

function VideoPage({ url }) {
  const openVideo = () => {
    if (url) Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={pagStyles.videoCard}>
      <Ionicons name="play-circle" size={72} color="#fff" />
      <Text style={pagStyles.videoText} numberOfLines={3}>{url}</Text>
      <TouchableOpacity style={pagStyles.videoBtn} onPress={openVideo} activeOpacity={0.85}>
        <Text style={pagStyles.videoBtnText}>Watch video</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function MediaViewer({
  visible,
  // New API
  media,
  startIndex = 0,
  // Legacy API (backward compat)
  imageUrl,
  videoUrl,
  onClose,
}) {
  const items = buildMedia(media, imageUrl, videoUrl);
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const flatRef = useRef(null);

  // When startIndex changes (e.g. user taps different carousel item), reset
  React.useEffect(() => {
    if (visible) {
      setCurrentIndex(startIndex);
    }
  }, [visible, startIndex]);

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  if (items.length === 0) return null;

  const showDots = items.length > 1;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.backdrop}>
        {/* Tap-to-close background */}
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />

        {/* Paginated media list */}
        <FlatList
          ref={flatRef}
          data={items}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          initialScrollIndex={startIndex}
          getItemLayout={(_, index) => ({
            length: SCREEN_W,
            offset: SCREEN_W * index,
            index,
          })}
          renderItem={({ item }) => (
            <View style={styles.page}>
              {item.type === 'image'
                ? <ImagePage url={item.url} />
                : <VideoPage url={item.url} />
              }
            </View>
          )}
        />

        {/* Pagination dots */}
        {showDots && (
          <View style={styles.dotsRow} pointerEvents="none">
            {items.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === currentIndex && styles.dotActive]}
              />
            ))}
          </View>
        )}

        {/* Close button */}
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          activeOpacity={0.8}
          hitSlop={12}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const pagStyles = StyleSheet.create({
  image: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
  videoCard: {
    width: SCREEN_W,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  videoText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    textAlign: 'center',
  },
  videoBtn: {
    backgroundColor: '#34d399',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  videoBtnText: { color: '#0a0a0a', fontSize: 15, fontWeight: '700' },
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  page: {
    width: SCREEN_W,
    height: SCREEN_H,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotsRow: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 56 : 32,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    backgroundColor: '#34d399',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  closeBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 24,
    right: 16,
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
