import React from 'react';
import { NavLink, Outlet, useNavigate, useMatch } from 'react-router-dom';
import { api } from '../api';

export default function AppShell({ auth }) {
  const navigate = useNavigate();
  const isMonitoring = useMatch('/projects/:id');
  const [lastProjectId, setLastProjectId] = React.useState(null);

  // Remember last visited project
  React.useEffect(() => {
    if (isMonitoring?.params?.id) {
      setLastProjectId(isMonitoring.params.id);
    }
  }, [isMonitoring]);

  async function handleLogout() {
    try { await api.logout(); } catch {}
    auth.setUser(null);
    navigate('/auth', { replace: true });
  }

  async function handleMonitoringClick() {
    if (lastProjectId) {
      navigate(`/projects/${lastProjectId}`);
    } else {
      try {
        const { projects } = await api.listProjects();
        if (projects && projects.length > 0) {
          navigate(`/projects/${projects[0].id}`);
        } else {
          navigate('/create');
        }
      } catch {
        navigate('/');
      }
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">

        {/* Brand */}
        <div className="brand">
          <div className="logo">CB</div>
          <div>
            <div className="brand-title">Cloud Balance</div>
            <div className="brand-sub">Load balancing, simplified</div>
          </div>
        </div>

        <nav className="nav">

          {/* ── MAIN ── */}
          <div style={{
            fontSize: '11px', fontWeight: '700', color: '#6b7280',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            padding: '0 12px', marginBottom: '6px', marginTop: '8px'
          }}>Main</div>

          <NavLink to="/" end className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}>
            <span className="nav-ico">⊞</span>
            <span>Dashboard</span>
          </NavLink>

          <NavLink to="/create" className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}>
            <span className="nav-ico">＋</span>
            <span>New Project</span>
          </NavLink>

          {/* ── MONITORING ── */}
          <div style={{
            fontSize: '11px', fontWeight: '700', color: '#6b7280',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            padding: '0 12px', marginBottom: '6px', marginTop: '20px'
          }}>Monitoring</div>

          <div
            className={"nav-item" + (isMonitoring ? " active" : "")}
            style={{ cursor: 'pointer' }}
            onClick={handleMonitoringClick}
          >
            <span className="nav-ico">📊</span>
            <span>Real-Time Monitor</span>
          </div>

          {/* ── SETTINGS ── */}
          <div style={{
            fontSize: '11px', fontWeight: '700', color: '#6b7280',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            padding: '0 12px', marginBottom: '6px', marginTop: '20px'
          }}>Settings</div>

          <NavLink to="/settings" className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}>
            <span className="nav-ico">⚙️</span>
            <span>Settings</span>
          </NavLink>

          <button
            className="nav-item"
            onClick={handleLogout}
            style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer' }}
          >
            <span className="nav-ico">↩</span>
            <span>Logout</span>
          </button>

        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <button
            className="account-pill"
            onClick={() => navigate('/account')}
            title="Account"
            style={{ cursor: 'pointer' }}
          >
            <span className="avatar">{(auth.user?.name || 'U').slice(0, 1).toUpperCase()}</span>
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