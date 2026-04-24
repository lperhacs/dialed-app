import { useState, useRef } from 'react';
import api from '../api/client';

// Detects a @mention being typed at the end of the text
function getActiveQuery(text) {
  const m = text.match(/@(\w*)$/);
  return m ? m[1] : null; // '' when just @, word when @word, null when no @
}

export default function useMentionInput(value, setValue) {
  const [suggestions, setSuggestions] = useState([]);
  const timer = useRef(null);

  function onChangeText(text) {
    setValue(text);
    clearTimeout(timer.current);
    const q = getActiveQuery(text);

    if (q === null) {
      // No active @ - hide
      setSuggestions([]);
      return;
    }

    if (q === '') {
      // Bare @ typed - immediately show suggested/recent people
      api.get('/users/suggested')
        .then(r => setSuggestions(r.data.slice(0, 6)))
        .catch(() => setSuggestions([]));
      return;
    }

    // @word - debounced search
    timer.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
        setSuggestions(data.slice(0, 6));
      } catch {
        setSuggestions([]);
      }
    }, 200);
  }

  function pickMention(username) {
    const newVal = value.replace(/@\w*$/, `@${username} `);
    setValue(newVal);
    setSuggestions([]);
  }

  return { suggestions, onChangeText, pickMention };
}
