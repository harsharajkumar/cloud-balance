import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function AppShell({ auth }) {
  const navigate = useNavigate();

  async function handleLogout() {
    try { await api.logout(); } catch {}
    auth.setUser(null);
    navigate('/auth', { replace: true });
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">CB</div>
          <div>
            <div className="brand-title">Cloud Balance</div>
            <div className="brand-sub">Load balancing, simplified</div>
          </div>
        </div>

        <nav className="nav">
          <NavLink to="/" end className={({isActive}) => "nav-item" + (isActive ? " active" : "")}>
            <span className="nav-ico">🏠</span>
            <span>Dashboard</span>
          </NavLink>

          <NavLink to="/create" className={({isActive}) => "nav-item" + (isActive ? " active" : "")}>
            <span className="nav-ico">＋</span>
            <span>New Project</span>
          </NavLink>

          <NavLink to="/settings" className={({isActive}) => "nav-item" + (isActive ? " active" : "")}>
            <span className="nav-ico">⚙️</span>
            <span>Settings</span>
          </NavLink>

          <button className="nav-item" onClick={handleLogout} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'left' }}>
            <span className="nav-ico">↩</span>
            <span>Logout</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <button
            className="account-pill"
            onClick={() => navigate('/account')}
            title="Account"
            style={{ cursor: 'pointer' }}
          >
            <span className="avatar">{(auth.user?.name || 'U').slice(0,1).toUpperCase()}</span>
            <span className="acct">
              <span className="acct-name">{auth.user?.name || 'User'}</span>
              <span className="acct-email">{auth.user?.email || ''}</span>
            </span>
            <span className="chev">›</span>
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
