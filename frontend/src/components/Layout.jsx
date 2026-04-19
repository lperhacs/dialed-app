import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import Avatar from './Avatar';

const IconHome = () => (
  <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const IconCalendar = () => (
  <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

const IconTarget = () => (
  <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="6"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
);

const IconUsers = () => (
  <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const IconTrophy = () => (
  <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="8 22 12 17 16 22"/>
    <line x1="12" y1="17" x2="12" y2="11"/>
    <path d="M17 11V6a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v5a5 5 0 0 0 10 0z"/>
    <path d="M7 7H5a2 2 0 0 0 0 4h2"/>
    <path d="M17 7h2a2 2 0 0 1 0 4h-2"/>
  </svg>
);

const IconBell = () => (
  <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

const IconUser = () => (
  <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const IconLogout = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    api.get('/notifications').then(r => setUnread(r.data.unread_count)).catch(() => {});
    const interval = setInterval(() => {
      api.get('/notifications').then(r => setUnread(r.data.unread_count)).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Link to="/" className="logo">
          <div className="logo-icon">D</div>
          <span className="logo-text">Dialed</span>
        </Link>

        <nav>
          <ul className="nav-list">
            <li className="nav-item">
              <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon"><IconHome /></span>
                <span>Home</span>
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink to="/events" className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon"><IconCalendar /></span>
                <span>Events</span>
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink to="/habits" className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon"><IconTarget /></span>
                <span>My Habits</span>
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink to="/clubs" className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon"><IconUsers /></span>
                <span>Clubs</span>
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink to="/leaderboard" className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon"><IconTrophy /></span>
                <span>Leaderboard</span>
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink to="/notifications" className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setUnread(0)}>
                <span className="nav-icon"><IconBell /></span>
                <span>Notifications</span>
                {unread > 0 && <span className="nav-badge">{unread > 99 ? '99+' : unread}</span>}
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink to={`/profile/${user?.username}`} className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon"><IconUser /></span>
                <span>Profile</span>
              </NavLink>
            </li>
          </ul>
        </nav>

        <div className="sidebar-footer">
          <div className="user-pill" onClick={() => navigate(`/profile/${user?.username}`)}>
            <Avatar user={user} size="sm" />
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div className="user-pill-name truncate">{user?.display_name}</div>
              <div className="user-pill-handle truncate">@{user?.username}</div>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={e => { e.stopPropagation(); handleLogout(); }}
              title="Log out"
            ><IconLogout /></button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
