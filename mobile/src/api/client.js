import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../theme';

// ── In-memory GET cache ───────────────────────────────────────────────────────
// Keyed by full URL. Only GET requests. TTLs in milliseconds.
const CACHE_TTLS = {
  '/feed':          45_000,
  '/feed/for-you':  45_000,
  '/habits':        60_000,
  '/users/':        60_000,  // prefix match - profile pages
  '/events/discover': 60_000,
};

const _cache = new Map(); // url → { data, expires }

function getTTL(url) {
  for (const [prefix, ttl] of Object.entries(CACHE_TTLS)) {
    if (url.includes(prefix)) return ttl;
  }
  return 0;
}

export function invalidateCache(urlSubstring) {
  for (const key of _cache.keys()) {
    if (key.includes(urlSubstring)) _cache.delete(key);
  }
}

const api = axios.create({ baseURL: `${API_BASE_URL}/api`, timeout: 10000 });

// Attach stored JWT on every request
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('dialed_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Serve from cache for eligible GET requests
  if (config.method === 'get' || !config.method) {
    const url = config.url + (config.params ? JSON.stringify(config.params) : '');
    const ttl = getTTL(url);
    if (ttl > 0) {
      const hit = _cache.get(url);
      if (hit && hit.expires > Date.now()) {
        // Abort the real request and return cached data via a custom adapter
        config.adapter = () => Promise.resolve({ data: hit.data, status: 200, statusText: 'OK (cached)', headers: {}, config });
      }
    }
  }
  return config;
});

// Redirect to login on 401; populate cache on successful GET
api.interceptors.response.use(
  (r) => {
    if ((r.config.method === 'get' || !r.config.method) && r.status === 200) {
      const url = r.config.url + (r.config.params ? JSON.stringify(r.config.params) : '');
      const ttl = getTTL(url);
      if (ttl > 0) _cache.set(url, { data: r.data, expires: Date.now() + ttl });
    }
    return r;
  },
  async (err) => {
    if (err.response?.status === 401) {
      await AsyncStorage.multiRemove(['dialed_token', 'dialed_user']);
      // AuthContext will detect the missing token on next render
    }
    return Promise.reject(err);
  }
);

export default api;
