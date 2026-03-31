import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { api } from './api';

import AuthPage from './pages/AuthPage.jsx';
import DashboardHome from './pages/DashboardHome.jsx';
import NewProject from './pages/NewProject.jsx';
import Account from './pages/Account.jsx';
import Settings from './pages/Settings.jsx';
import AppShell from './ui/AppShell.jsx';
import ProjectDetail from './pages/ProjectDetail';


// In routes:


function useAuth() {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const { user } = await api.me();
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  return { user, setUser, loading, refresh };
}

function RequireAuth({ user, loading, children }) {
  const loc = useLocation();
  if (loading) return <div className="app" style={{ padding: 24 }}>Loading…</div>;
  if (!user) return <Navigate to="/auth" replace state={{ from: loc.pathname }} />;
  return children;
}

export default function App() {
  const auth = useAuth();

  return (
    <Routes>
      <Route path="/auth" element={<AuthPage auth={auth} />} />
      <Route
        path="/"
        element={
          <RequireAuth user={auth.user} loading={auth.loading}>
            <AppShell auth={auth} />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardHome auth={auth} />} />
        <Route path="create" element={<NewProject auth={auth} />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="account" element={<Account auth={auth} />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
