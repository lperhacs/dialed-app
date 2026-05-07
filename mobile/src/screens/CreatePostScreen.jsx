import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Image, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator, Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import api, { invalidateCache } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import MentionSuggestions from '../components/MentionSuggestions';
import useMentionInput from '../hooks/useMentionInput';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

const MAX_IMAGES = 10;
const MAX_VIDEO_URLS = 5;

export default function CreatePostScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const [content, setContent] = useState(route.params?.draft || '');
  const { suggestions: mentionSuggestions, onChangeText: onMentionChangeText, pickMention } = useMentionInput(content, setContent);
  // Multi-image support
  const [images, setImages] = useState([]);
  // Multi-video URL support
  const [videoUrls, setVideoUrls] = useState([]);
  const [habitId, setHabitId] = useState(route.params?.habit_id ? String(route.params.habit_id) : '');
  const [habitDay, setHabitDay] = useState(route.params?.habit_day ? String(route.params.habit_day) : '');
  const [habits, setHabits] = useState([]);
  const [showHabits, setShowHabits] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const required = !!route.params?.required;

  useEffect(() => {
    api.get('/habits').then(r => setHabits(r.data.filter(h => h.is_active))).catch(() => {});
  }, []);

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to attach images.');
      return;
    }
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      Alert.alert('Limit reached', `You can attach up to ${MAX_IMAGES} photos per post.`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: remaining,
    });
    if (!result.canceled) {
      setImages(prev => {
        const combined = [...prev, ...result.assets];
        return combined.slice(0, MAX_IMAGES);
      });
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to take photos.');
      return;
    }
    if (images.length >= MAX_IMAGES) {
      Alert.alert('Limit reached', `You can attach up to ${MAX_IMAGES} photos per post.`);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled) {
      setImages(prev => {
        const combined = [...prev, ...result.assets];
        return combined.slice(0, MAX_IMAGES);
      });
    }
  };

  const showPhotoOptions = () => {
    Alert.alert('Add Photo', null, [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickImages },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const removeImage = (idx) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  const addVideoUrl = () => {
    if (videoUrls.length >= MAX_VIDEO_URLS) {
      Alert.alert('Limit reached', `You can add up to ${MAX_VIDEO_URLS} video links per post.`);
      return;
    }
    setVideoUrls(prev => [...prev, '']);
    setShowHabits(false);
  };

  const updateVideoUrl = (idx, value) => {
    setVideoUrls(prev => prev.map((v, i) => i === idx ? value : v));
  };

  const removeVideoUrl = (idx) => {
    setVideoUrls(prev => prev.filter((_, i) => i !== idx));
  };

  const hasMedia = images.length > 0 || videoUrls.some(v => v.trim());

  const handleSubmit = async () => {
    if (!content.trim() && !hasMedia) {
      Alert.alert('Empty post', 'Add some text, a photo, or a video.');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('content', content);

      // Append each image under the same key — RN FormData supports this
      images.forEach((img, i) => {
        formData.append('images', {
          uri: img.uri,
          type: 'image/jpeg',
          name: `photo_${i}.jpg`,
        });
      });

      // Backward compat: first image also as image_url (handled server-side via image field)
      // and first image as legacy 'image' key
      if (images.length > 0) {
        formData.append('image', {
          uri: images[0].uri,
          type: 'image/jpeg',
          name: 'photo.jpg',
        });
      }

      // Video URLs as JSON string + legacy single field
      const filledUrls = videoUrls.filter(v => v.trim());
      if (filledUrls.length > 0) {
        formData.append('video_urls', JSON.stringify(filledUrls));
        // Backward compat
        formData.append('video_url', filledUrls[0]);
      }

      if (habitId) formData.append('habit_id', habitId);
      if (habitDay) formData.append('habit_day', habitDay);

      await api.post('/posts', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not create post.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedHabit = habits.find(h => String(h.id) === habitId) || (
    habitId && route.params?.habit_name
      ? { id: habitId, name: route.params.habit_name, color: route.params.habit_color || '#34d399' }
      : null
  );

  const postBtnDisabled = submitting || (!content.trim() && !hasMedia);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="height"
    >
      {/* Modal header */}
      <View style={styles.modalHeader}>
        <TouchableOpacity
          onPress={() => {
            if (required) {
              Alert.alert(
                'Undo your log?',
                'Your habit log will be removed if you leave without posting.',
                [
                  { text: 'Keep editing', style: 'cancel' },
                  {
                    text: 'Undo log',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await api.delete(`/habits/${route.params.habit_id}/log`);
                        // Bust cached /habits so HabitsScreen re-fetches the
                        // fresh period_count/streak instead of the stale
                        // optimistic-bumped version.
                        invalidateCache('/habits');
                        navigation.goBack();
                      } catch (err) {
                        Alert.alert(
                          'Could not undo',
                          err.response?.data?.error ||
                            'Your log may still be saved. Pull to refresh on Habits.'
                        );
                        invalidateCache('/habits');
                        navigation.goBack();
                      }
                    },
                  },
                ]
              );
            } else {
              navigation.goBack();
            }
          }}
          style={styles.cancelBtn}
        >
          <Text style={styles.cancelText}>{required ? 'Undo Log' : 'Cancel'}</Text>
        </TouchableOpacity>
        <Text style={styles.modalTitle}>New Post</Text>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={postBtnDisabled}
          style={[styles.postBtn, postBtnDisabled && styles.postBtnDisabled]}
          activeOpacity={0.85}
        >
          {submitting
            ? <ActivityIndicator color="white" size="small" />
            : <Text style={styles.postBtnText}>Post</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Composer */}
        <View style={styles.composer}>
          <Avatar user={user} size="md" />
          <View style={{ flex: 1 }}>
            <MentionSuggestions suggestions={mentionSuggestions} onSelect={pickMention} />
            <TextInput
              style={styles.textInput}
              value={content}
              onChangeText={onMentionChangeText}
              placeholder="What are you dialed into today?"
              placeholderTextColor={colors.textDim}
              multiline
              autoFocus
              maxLength={500}
            />
            {/* Habit button - directly below input, under avatar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => setShowHabits(v => !v)}
                style={[styles.habitInlineBtn, (showHabits || selectedHabit) && styles.habitInlineBtnActive]}
                activeOpacity={0.75}
              >
                <Text style={[styles.habitInlineBtnText, (showHabits || selectedHabit) && styles.habitInlineBtnTextActive]}>
                  {selectedHabit ? selectedHabit.name : 'Tag a habit'}
                </Text>
              </TouchableOpacity>
              {selectedHabit && (
                <TouchableOpacity onPress={() => { setHabitId(''); setHabitDay(''); }} hitSlop={8}>
                  <Ionicons name="close" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        <Text style={styles.charCount}>{content.length}/500</Text>

        {/* Image thumbnails row */}
        {images.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.thumbnailRow}
            contentContainerStyle={styles.thumbnailRowContent}
          >
            {images.map((img, idx) => (
              <View key={idx} style={styles.thumbnail}>
                <Image source={{ uri: img.uri }} style={styles.thumbnailImg} resizeMode="cover" />
                <TouchableOpacity onPress={() => removeImage(idx)} style={styles.removeThumbnailBtn}>
                  <Ionicons name="close" size={12} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            {images.length < MAX_IMAGES && (
              <TouchableOpacity onPress={showPhotoOptions} style={styles.addMoreBtn} activeOpacity={0.75}>
                <Ionicons name="add" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </ScrollView>
        )}

        {/* Habit tag display */}
        {selectedHabit && (
          <View style={[styles.habitTag, { borderColor: selectedHabit.color }]}>
            <Text style={[styles.habitTagText, { color: selectedHabit.color }]}>
              {selectedHabit.name}
            </Text>
            {habitDay ? <Text style={[styles.habitTagText, { color: selectedHabit.color }]}> · Day {habitDay}</Text> : null}
            <TouchableOpacity onPress={() => { setHabitId(''); setHabitDay(''); }} style={{ marginLeft: 'auto' }} hitSlop={8}>
              <Ionicons name="close" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Habit picker */}
        {showHabits && (
          <View style={styles.habitPicker}>
            <Text style={styles.pickerTitle}>Tag a Habit</Text>
            {habits.length === 0 ? (
              <Text style={styles.noHabits}>No active habits. Create one in the Habits tab.</Text>
            ) : (
              habits.map(h => (
                <TouchableOpacity
                  key={h.id}
                  style={[styles.habitOption, String(h.id) === habitId && styles.habitOptionSelected]}
                  onPress={() => { setHabitId(String(h.id)); setShowHabits(false); }}
                >
                  <View style={[styles.habitDot, { backgroundColor: h.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.habitName}>{h.name}</Text>
                    <Text style={styles.habitStreak}>{h.streak}d streak</Text>
                  </View>
                  {String(h.id) === habitId && <Ionicons name="checkmark" size={16} color={colors.accent} />}
                </TouchableOpacity>
              ))
            )}
            {selectedHabit && (
              <View style={styles.dayInputRow}>
                <Text style={styles.dayInputLabel}>Day number (e.g. Day 14):</Text>
                <TextInput
                  style={styles.dayInput}
                  value={habitDay}
                  onChangeText={setHabitDay}
                  placeholder="14"
                  placeholderTextColor={colors.textDim}
                  keyboardType="number-pad"
                />
              </View>
            )}
          </View>
        )}

        {/* Video URL inputs */}
        {videoUrls.map((url, idx) => (
          <View key={idx} style={styles.videoInputWrap}>
            <View style={styles.videoInputRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={url}
                onChangeText={v => updateVideoUrl(idx, v)}
                placeholder="YouTube / Vimeo embed URL"
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                keyboardType="url"
              />
              <TouchableOpacity onPress={() => removeVideoUrl(idx)} style={styles.removeVideoBtn} hitSlop={8}>
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity onPress={showPhotoOptions} style={styles.toolBtn} activeOpacity={0.7}>
          <Ionicons name="image-outline" size={18} color={colors.textMuted} />
          <Text style={styles.toolLabel}>
            Photo{images.length > 0 ? ` (${images.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={addVideoUrl}
          style={[styles.toolBtn, videoUrls.length > 0 && styles.toolBtnActive]}
          activeOpacity={0.7}
        >
          <Ionicons name="videocam-outline" size={18} color={videoUrls.length > 0 ? colors.accent : colors.textMuted} />
          <Text style={[styles.toolLabel, videoUrls.length > 0 && { color: colors.accent }]}>
            Video{videoUrls.length > 0 ? ` (${videoUrls.length})` : ''}
          </Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => Keyboard.dismiss()}
          style={styles.toolBtn}
          activeOpacity={0.7}
          hitSlop={8}
        >
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          <Text style={styles.toolLabel}>Done</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgCard },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  cancelBtn: { paddingVertical: 4, paddingRight: 8 },
  cancelText: { color: colors.textMuted, fontSize: 15 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  postBtn: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: 18, paddingVertical: 7 },
  postBtnDisabled: { opacity: 0.45 },
  postBtnText: { color: colors.bg, fontSize: 14, fontWeight: '700' },
  scroll: { flex: 1 },
  composer: { flexDirection: 'row', gap: 12, padding: 16 },
  textInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: { textAlign: 'right', color: colors.textDim, fontSize: 12, paddingRight: 16, marginTop: -8, marginBottom: 8 },
  // Image thumbnails
  thumbnailRow: { marginHorizontal: 16, marginBottom: 12 },
  thumbnailRowContent: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  thumbnail: { position: 'relative', width: 72, height: 72 },
  thumbnailImg: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: colors.bgHover,
  },
  removeThumbnailBtn: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addMoreBtn: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgHover,
  },
  habitTag: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: colors.bgHover,
  },
  habitTagText: { fontSize: 13, fontWeight: '600' },
  habitPicker: { margin: 16, backgroundColor: colors.bgHover, borderRadius: 12, padding: 14 },
  pickerTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 10 },
  noHabits: { color: colors.textMuted, fontSize: 13 },
  habitOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  habitOptionSelected: { backgroundColor: colors.accentDim },
  habitDot: { width: 10, height: 10, borderRadius: 5 },
  habitName: { fontSize: 14, fontWeight: '600', color: colors.text },
  habitStreak: { fontSize: 12, color: colors.textMuted },
  dayInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  dayInputLabel: { fontSize: 13, color: colors.textMuted, flex: 1 },
  dayInput: {
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
    width: 70,
    textAlign: 'center',
  },
  videoInputWrap: { marginHorizontal: 16, marginBottom: 8 },
  videoInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    backgroundColor: colors.bgInput,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  removeVideoBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    gap: 4,
    padding: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bgCard,
  },
  habitInlineBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  habitInlineBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  habitInlineBtnText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  habitInlineBtnTextActive: { color: colors.accent },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  toolBtnActive: { backgroundColor: colors.accentDim },
  toolLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  });
}
