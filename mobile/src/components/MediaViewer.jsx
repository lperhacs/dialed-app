import React from 'react';
import {
  Modal, View, Image, TouchableOpacity, StyleSheet,
  Dimensions, StatusBar, Platform, Linking, Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function MediaViewer({ visible, imageUrl, videoUrl, onClose }) {
  const openVideo = () => {
    if (videoUrl) Linking.openURL(videoUrl).catch(() => {});
  };

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
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />

        {!!imageUrl && (
          <Image
            source={{ uri: imageUrl }}
            style={imageUrl && videoUrl ? styles.imageWithVideo : styles.image}
            resizeMode="contain"
          />
        )}

        {!!videoUrl && (
          <View style={[styles.videoCard, imageUrl && styles.videoCardBelow]}>
            <Ionicons name="play-circle" size={imageUrl ? 40 : 72} color="#fff" />
            <Text style={styles.videoText} numberOfLines={2}>
              {videoUrl}
            </Text>
            <TouchableOpacity style={styles.videoBtn} onPress={openVideo} activeOpacity={0.85}>
              <Text style={styles.videoBtnText}>Watch video</Text>
            </TouchableOpacity>
          </View>
        )}

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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
  imageWithVideo: {
    width: SCREEN_W,
    height: SCREEN_H * 0.65,
  },
  videoCard: {
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  videoCardBelow: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
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
