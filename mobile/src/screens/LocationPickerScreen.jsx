import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, FlatList, Keyboard, Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

const DEFAULT_REGION = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function LocationPickerScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [pin, setPin] = useState(null); // { latitude, longitude, address }
  const [region, setRegion] = useState(DEFAULT_REGION);
  const searchTimeout = useRef(null);

  // Ask for location permission and center on user
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const r = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        };
        setRegion(r);
        mapRef.current?.animateToRegion(r, 500);
      }
    })();
  }, []);

  // Debounced geocode search
  useEffect(() => {
    clearTimeout(searchTimeout.current);
    if (!query.trim() || query.length < 3) { setSuggestions([]); return; }
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const results = await Location.geocodeAsync(query);
        const enriched = await Promise.all(
          results.slice(0, 5).map(async (r) => {
            const rev = await Location.reverseGeocodeAsync({ latitude: r.latitude, longitude: r.longitude });
            const a = rev[0];
            const label = [a?.name, a?.street, a?.city, a?.region, a?.country]
              .filter(Boolean).join(', ');
            return { latitude: r.latitude, longitude: r.longitude, address: label };
          })
        );
        setSuggestions(enriched);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 500);
  }, [query]);

  const selectSuggestion = (item) => {
    Keyboard.dismiss();
    setSuggestions([]);
    setQuery(item.address);
    setPin(item);
    const r = { latitude: item.latitude, longitude: item.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    setRegion(r);
    mapRef.current?.animateToRegion(r, 500);
  };

  const handleMapLongPress = async (e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    try {
      const rev = await Location.reverseGeocodeAsync({ latitude, longitude });
      const a = rev[0];
      const address = [a?.name, a?.street, a?.city, a?.region, a?.country]
        .filter(Boolean).join(', ') || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      setPin({ latitude, longitude, address });
      setQuery(address);
      setSuggestions([]);
    } catch {
      setPin({ latitude, longitude, address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` });
    }
  };

  const handleConfirm = () => {
    if (!pin) return;
    // Pass selected address back to the screen that navigated here
    navigation.navigate(route.params?.returnScreen ?? 'CreateEvent', {
      selectedLocation: pin.address,
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pick a Location</Text>
        <TouchableOpacity
          onPress={handleConfirm}
          disabled={!pin}
          style={[styles.confirmBtn, !pin && styles.confirmBtnDisabled]}
          activeOpacity={0.8}
        >
          <Text style={styles.confirmBtnText}>Confirm</Text>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search address or place…"
          placeholderTextColor={colors.textDim}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searching && <ActivityIndicator size="small" color={colors.textMuted} style={{ marginRight: 10 }} />}
      </View>

      {/* Suggestions dropdown */}
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          <FlatList
            data={suggestions}
            keyExtractor={(_, i) => String(i)}
            keyboardShouldPersistTaps="always"
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.suggestionRow} onPress={() => selectSuggestion(item)} activeOpacity={0.7}>
                <Ionicons name="location-outline" size={16} color={colors.textMuted} style={{ marginTop: 1 }} />
                <Text style={styles.suggestionText} numberOfLines={2}>{item.address}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={region}
        onLongPress={handleMapLongPress}
        showsUserLocation
        showsCompass
      >
        {pin && (
          <Marker coordinate={{ latitude: pin.latitude, longitude: pin.longitude }} pinColor={colors.accent} />
        )}
      </MapView>

      {/* Hint */}
      {!pin && (
        <View style={styles.hint}>
          <Text style={styles.hintText}>Search above or long-press the map to drop a pin</Text>
        </View>
      )}

      {/* Selected address bar */}
      {pin && (
        <View style={styles.selectedBar}>
          <Ionicons name="location" size={18} color={colors.accent} />
          <Text style={styles.selectedText} numberOfLines={2}>{pin.address}</Text>
        </View>
      )}
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  confirmBtn: { backgroundColor: colors.accent, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7 },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: 12, marginBottom: 0,
    backgroundColor: colors.bgHover, borderRadius: radius.lg,
    paddingLeft: 10,
  },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 11, paddingRight: 8 },
  suggestions: {
    marginHorizontal: 12, marginTop: 4,
    backgroundColor: colors.bgCard ?? colors.bgHover,
    borderRadius: radius.md,
    maxHeight: 220,
    borderWidth: 1, borderColor: colors.borderSubtle,
    zIndex: 10,
  },
  suggestionRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  suggestionText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 19 },
  map: { flex: 1, marginTop: 12 },
  hint: {
    position: 'absolute', bottom: 80, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.full,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  hintText: { color: '#fff', fontSize: 13 },
  selectedBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 14, paddingBottom: 14 + 0,
    backgroundColor: colors.bgCard ?? colors.bg,
    borderTopWidth: 1, borderTopColor: colors.borderSubtle,
  },
  selectedText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  });
}
