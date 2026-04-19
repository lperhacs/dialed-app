import { useState, useRef } from 'react';
import api from '../api/client';

function getActiveQuery(text) {
  const m = text.match(/@(\w*)$/);
  return m ? m[1] : null; // '' on bare @, word on @word, null otherwise
}

export default function useMentionInput(value, setValue) {
  const [suggestions, setSuggestions] = useState([]);
  const timer = useRef(null);

  function onChange(text) {
    setValue(text);
    clearTimeout(timer.current);
    const q = getActiveQuery(text);

    if (q === null) {
      setSuggestions([]);
      return;
    }

    if (q === '') {
      // Bare @ — show recent/engaged people immediately
      api.get('/users/suggested')
        .then(r => setSuggestions(r.data.slice(0, 6)))
        .catch(() => setSuggestions([]));
      return;
    }

    // @word — debounced search
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
    setValue(value.replace(/@\w*$/, `@${username} `));
    setSuggestions([]);
  }

  return { suggestions, onChange, pickMention };
}
