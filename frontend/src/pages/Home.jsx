import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import PostCard from '../components/PostCard';
import CreatePost from '../components/CreatePost';

export default function Home() {
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [tab, setTab] = useState('following');

  const fetchPosts = useCallback(async (p = 1, t = tab, reset = false) => {
    setLoading(true);
    try {
      const endpoint = t === 'following' ? '/posts' : '/posts/explore';
      const { data } = await api.get(`${endpoint}?page=${p}`);
      if (reset) {
        setPosts(data);
      } else {
        setPosts(prev => [...prev, ...data]);
      }
      setHasMore(data.length === 20);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchPosts(1, tab, true);
  }, [tab]);

  const handlePost = newPost => {
    setPosts(prev => [newPost, ...prev]);
  };

  const handleDelete = id => {
    setPosts(prev => prev.filter(p => p.id !== id));
  };

  const switchTab = t => {
    if (t !== tab) {
      setTab(t);
      setPosts([]);
    }
  };

  return (
    <div>
      <div className="feed-header">
        <div className="tabs" style={{ border: 'none', padding: 0 }}>
          <button className={`tab-btn ${tab === 'following' ? 'active' : ''}`} onClick={() => switchTab('following')}>
            Pulse Check
          </button>
          <button className={`tab-btn ${tab === 'explore' ? 'active' : ''}`} onClick={() => switchTab('explore')}>
            Explore
          </button>
        </div>
      </div>

      <CreatePost onPost={handlePost} />

      <div>
        {posts.map(post => (
          <PostCard key={post.id} post={post} onDelete={handleDelete} />
        ))}
      </div>

      {loading && (
        <div className="loading-center"><div className="spinner" /></div>
      )}

      {!loading && posts.length === 0 && (
        <div className="empty-state">
          <div className="emoji">🔥</div>
          <h3>Nothing here yet</h3>
          <p>
            {tab === 'following'
              ? 'Follow some people to see their posts here, or check the Explore tab.'
              : 'Nothing to explore yet. Be the first to post!'}
          </p>
        </div>
      )}

      {!loading && hasMore && posts.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <button className="btn btn-outline" onClick={() => fetchPosts(page + 1, tab)}>
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
