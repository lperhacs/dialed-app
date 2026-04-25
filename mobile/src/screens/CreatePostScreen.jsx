import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Image, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import MentionSuggestions from '../components/MentionSuggestions';
import useMentionInput from '../hooks/useMentionInput';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

export default function CreatePostScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const [content, setContent] = useState(route.params?.draft || '');
  const { suggestions: mentionSuggestions, onChangeText: onMentionChangeText, pickMention } = useMentionInput(content, setContent);
  const [image, setImage] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [habitId, setHabitId] = useState(route.params?.habit_id ? String(route.params.habit_id) : '');
  const [habitDay, setHabitDay] = useState(route.params?.habit_day ? String(route.params.habit_day) : '');
  const [habits, setHabits] = useState([]);
  const [showHabits, setShowHabits] = useState(false);
  const [showVideoInput, setShowVideoInput] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/habits').then(r => setHabits(r.data.filter(h => h.is_active))).catch(() => {});
  }, []);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to attach images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled) setImage(result.assets[0]);
  };

  const handleSubmit = async () => {
    if (!content.trim() && !image && !videoUrl) {
      Alert.alert('Empty post', 'Add some text, a photo, or a video.');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('content', content);
      if (image) {
        formData.append('image', {
          uri: image.uri,
          type: 'image/jpeg',
          name: 'photo.jpg',
        });
      }
      if (videoUrl) formData.append('video_url', videoUrl);
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Modal header */}
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.modalTitle}>New Post</Text>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting || (!content.trim() && !image && !videoUrl)}
          style={[styles.postBtn, (submitting || (!content.trim() && !image && !videoUrl)) && styles.postBtnDisabled]}
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
                onPress={() => { setShowHabits(v => !v); setShowVideoInput(false); }}
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

        {/* Image preview */}
        {image && (
          <View style={styles.imagePreview}>
            <Image source={{ uri: image.uri }} style={styles.previewImg} resizeMode="cover" />
            <TouchableOpacity onPress={() => setImage(null)} style={styles.removeImgBtn}>
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
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
                  {habitId === h.id && <Ionicons name="checkmark" size={16} color={colors.accent} />}
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

        {/* Video input */}
        {showVideoInput && (
          <View style={styles.videoInputWrap}>
            <TextInput
              style={styles.input}
              value={videoUrl}
              onChangeText={setVideoUrl}
              placeholder="YouTube / Vimeo embed URL"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>
        )}
      </ScrollView>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity onPress={pickImage} style={styles.toolBtn} activeOpacity={0.7}>
          <Text style={styles.toolLabel}>Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setShowVideoInput(v => !v); setShowHabits(false); }}
          style={[styles.toolBtn, showVideoInput && styles.toolBtnActive]}
          activeOpacity={0.7}
        >
          <Text style={[styles.toolLabel, showVideoInput && { color: colors.accent }]}>Video</Text>
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
  imagePreview: { margin: 16, marginTop: 0, position: 'relative' },
  previewImg: { width: '100%', height: 200, borderRadius: 10, backgroundColor: colors.bgHover },
  removeImgBtn: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 14,
    width: 28, height: 28, justifyContent: 'center', alignItems: 'center',
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
