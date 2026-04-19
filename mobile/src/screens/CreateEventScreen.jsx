import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import LocationPickerModal from '../components/LocationPickerModal';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

const VISIBILITY = [
  { value: true,  label: 'Public',       icon: 'globe-outline',       desc: 'Anyone can see & join' },
  { value: false, label: 'Friends only',  icon: 'lock-closed-outline', desc: 'Only people you follow' },
];

function formatDisplayDate(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatDisplayTime(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function toISODate(date) {
  return date.toISOString().split('T')[0];
}

function toTimeString(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function CreateEventScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [location, setLocation] = useState('');
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [clubs, setClubs] = useState([]);
  const [selectedClub, setSelectedClub] = useState(null);
  const [showClubPicker, setShowClubPicker] = useState(false);

  useEffect(() => {
    api.get('/clubs').then(r => setClubs(r.data)).catch(() => {});
  }, []);

  const canSubmit = title.trim() && selectedDate;

  const handleSubmit = async () => {
    if (submittingRef.current || !canSubmit) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await api.post('/events', {
        title: title.trim(),
        description: description.trim() || null,
        event_date: toISODate(selectedDate),
        event_time: selectedTime ? toTimeString(selectedTime) : null,
        location: location.trim() || null,
        is_public: isPublic,
        club_id: selectedClub?.id || null,
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not create event.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.modalTitle}>New Event</Text>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting || !canSubmit}
          style={[styles.postBtn, (submitting || !canSubmit) && styles.postBtnDisabled]}
          activeOpacity={0.85}
        >
          <Text style={styles.postBtnText}>{submitting ? '…' : 'Post'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.composer}>
          <Avatar user={user} size="md" />
          <View style={{ flex: 1 }}>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Event title"
              placeholderTextColor={colors.textDim}
              maxLength={100}
              autoFocus
            />
            <TextInput
              style={styles.descInput}
              value={description}
              onChangeText={setDescription}
              placeholder="What's happening? Anyone can join!"
              placeholderTextColor={colors.textDim}
              multiline
              maxLength={500}
            />
          </View>
        </View>

        <View style={styles.fields}>
          {/* Date row — tapping opens calendar modal */}
          <TouchableOpacity style={styles.fieldRow} onPress={() => setShowCalendar(true)} activeOpacity={0.7}>
            <Ionicons name="calendar-outline" size={18} color={colors.textMuted} style={{ width: 24, textAlign: 'center' }} />
            <Text style={[styles.fieldInput, !selectedDate && { color: colors.textDim }]}>
              {selectedDate ? formatDisplayDate(selectedDate) : 'Select a date'}
            </Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.fieldRow} onPress={() => setShowTimePicker(true)} activeOpacity={0.7}>
            <Ionicons name="time-outline" size={18} color={colors.textMuted} style={{ width: 24, textAlign: 'center' }} />
            <Text style={[styles.fieldInput, !selectedTime && { color: colors.textDim }]}>
              {selectedTime ? formatDisplayTime(selectedTime) : 'Add a time (optional)'}
            </Text>
            {selectedTime ? (
              <TouchableOpacity onPress={() => setSelectedTime(null)} hitSlop={10}>
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.fieldRow}
            activeOpacity={0.7}
            onPress={() => setShowLocationPicker(true)}
          >
            <Ionicons name="location-outline" size={18} color={colors.textMuted} style={{ width: 24, textAlign: 'center' }} />
            <Text style={[styles.fieldInput, !location && { color: colors.textDim }]} numberOfLines={1}>
              {location || 'Location (optional)'}
            </Text>
            {location ? (
              <TouchableOpacity onPress={() => setLocation('')} hitSlop={10}>
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.fieldRow} onPress={() => setShowClubPicker(true)} activeOpacity={0.7}>
            <Ionicons name="flash-outline" size={18} color={colors.textMuted} style={{ width: 24, textAlign: 'center' }} />
            <Text style={[styles.fieldInput, !selectedClub && { color: colors.textDim }]} numberOfLines={1}>
              {selectedClub ? selectedClub.name : 'Share to a Club (optional)'}
            </Text>
            {selectedClub ? (
              <TouchableOpacity onPress={() => setSelectedClub(null)} hitSlop={10}>
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>

          <View style={styles.divider} />

          <View style={styles.visibilityRow}>
            {VISIBILITY.map(opt => (
              <TouchableOpacity
                key={String(opt.value)}
                style={[styles.visibilityOption, isPublic === opt.value && styles.visibilityOptionActive]}
                onPress={() => setIsPublic(opt.value)}
                activeOpacity={0.75}
              >
                <Ionicons name={opt.icon} size={20} color={isPublic === opt.value ? colors.accent : colors.textMuted} />
                <Text style={[styles.visibilityLabel, isPublic === opt.value && styles.visibilityLabelActive]}>{opt.label}</Text>
                <Text style={styles.visibilityDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      <LocationPickerModal
        visible={showLocationPicker}
        onConfirm={(address) => setLocation(address)}
        onClose={() => setShowLocationPicker(false)}
      />

      {/* Time picker modal */}
      <Modal visible={showTimePicker} transparent animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
        <TouchableOpacity style={styles.calendarBackdrop} activeOpacity={1} onPress={() => setShowTimePicker(false)}>
          <View style={styles.calendarCard} onStartShouldSetResponder={() => true}>
            <View style={styles.calendarHeader}>
              <Text style={styles.calendarTitle}>Select Time</Text>
              <TouchableOpacity onPress={() => setShowTimePicker(false)} style={styles.calendarDoneBtn} activeOpacity={0.8}>
                <Text style={styles.calendarDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={selectedTime ?? new Date()}
              mode="time"
              display="spinner"
              accentColor={colors.accent}
              textColor={colors.text}
              style={styles.calendar}
              onChange={(_, time) => { if (time) setSelectedTime(time); }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Club picker modal */}
      <Modal visible={showClubPicker} transparent animationType="slide" onRequestClose={() => setShowClubPicker(false)}>
        <TouchableOpacity style={styles.calendarBackdrop} activeOpacity={1} onPress={() => setShowClubPicker(false)} />
        <View style={[styles.calendarSheet, { paddingBottom: 32 }]}>
          <View style={styles.calendarHeader}>
            <Text style={styles.calendarTitle}>Share to Club</Text>
            <TouchableOpacity onPress={() => setShowClubPicker(false)} style={styles.calendarDoneBtn}>
              <Text style={styles.calendarDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
            {clubs.length === 0 ? (
              <Text style={{ color: colors.textMuted, padding: 20, textAlign: 'center' }}>You haven't joined any clubs yet.</Text>
            ) : (
              clubs.map(club => (
                <TouchableOpacity
                  key={club.id}
                  style={[styles.clubOption, selectedClub?.id === club.id && styles.clubOptionSelected]}
                  onPress={() => { setSelectedClub(club); setShowClubPicker(false); }}
                  activeOpacity={0.75}
                >
                  <View style={styles.clubOptionIcon}><Ionicons name="flash-outline" size={18} color={colors.textMuted} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.clubOptionName}>{club.name}</Text>
                    <Text style={styles.clubOptionMeta}>{club.member_count} members · {club.frequency}</Text>
                  </View>
                  {selectedClub?.id === club.id && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Calendar modal */}
      <Modal
        visible={showCalendar}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCalendar(false)}
      >
        <TouchableOpacity
          style={styles.calendarBackdrop}
          activeOpacity={1}
          onPress={() => setShowCalendar(false)}
        >
          <View style={styles.calendarCard} onStartShouldSetResponder={() => true}>
            <View style={styles.calendarHeader}>
              <Text style={styles.calendarTitle}>Select Date</Text>
              <TouchableOpacity
                onPress={() => setShowCalendar(false)}
                style={styles.calendarDoneBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.calendarDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={selectedDate ?? new Date()}
              mode="date"
              display="inline"
              minimumDate={new Date()}
              accentColor={colors.accent}
              textColor={colors.text}
              style={styles.calendar}
              onChange={(_, date) => { if (date) setSelectedDate(date); }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgCard },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  cancelBtn: { paddingVertical: 4, paddingRight: 8 },
  cancelText: { color: colors.textMuted, fontSize: 15 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  postBtn: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: 18, paddingVertical: 7 },
  postBtnDisabled: { opacity: 0.45 },
  postBtnText: { color: colors.bg, fontSize: 14, fontWeight: '700' },
  scroll: { flex: 1 },
  composer: { flexDirection: 'row', gap: 12, padding: 16, paddingBottom: 8 },
  titleInput: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8, paddingVertical: 0 },
  descInput: { color: colors.text, fontSize: 15, lineHeight: 21, minHeight: 60, textAlignVertical: 'top', paddingVertical: 0 },
  fields: { marginHorizontal: 16, marginTop: 8, backgroundColor: colors.bgHover, borderRadius: radius.lg, overflow: 'hidden' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  fieldIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  fieldInput: { flex: 1, color: colors.text, fontSize: 15 },
  divider: { height: 1, backgroundColor: colors.borderSubtle, marginLeft: 50 },
  visibilityRow: { flexDirection: 'row', gap: 10, padding: 12 },
  visibilityOption: { flex: 1, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.borderSubtle, padding: 12, alignItems: 'center', gap: 4 },
  visibilityOptionActive: { borderColor: colors.accent, backgroundColor: colors.accentDim ?? 'rgba(255,107,0,0.08)' },
  visibilityIcon: { fontSize: 22 },
  visibilityLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  visibilityLabelActive: { color: colors.accent },
  visibilityDesc: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },

  // Calendar
  calendarBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  calendarCard: {
    backgroundColor: colors.bgCard ?? colors.bg,
    borderRadius: 24, overflow: 'hidden', width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 16,
  },
  calendarHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4,
  },
  calendarTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  calendarDoneBtn: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: 16, paddingVertical: 6 },
  calendarDoneText: { color: colors.bg, fontWeight: '700', fontSize: 14 },
  calendar: { alignSelf: 'center' },
  clubOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  clubOptionSelected: { backgroundColor: colors.accentDim ?? 'rgba(255,107,0,0.08)' },
  clubOptionIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.bgHover, justifyContent: 'center', alignItems: 'center' },
  clubOptionName: { fontSize: 15, fontWeight: '700', color: colors.text },
  clubOptionMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  });
}
