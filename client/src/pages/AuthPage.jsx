import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api';

export default function AuthPage({ auth }) {
  const [mode, setMode] = React.useState('signin'); // signin | signup
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const to = location.state?.from || '/';

  React.useEffect(() => {
    if (auth.user) navigate('/', { replace: true });
  }, [auth.user, navigate]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') {
  await api.register(name.trim(), email.trim(), password);

  // Clear fields
  setName('');
  setEmail('');
  setPassword('');

  // Switch to Sign In tab
  setMode('signin');

  setError('Account created successfully. Please sign in.');
} else {
        const { user } = await api.login(email.trim(), password);
        auth.setUser(user);
        navigate(to, { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      {/* Force single-column layout */}
      <div className="auth-card" style={{ gridTemplateColumns: '1fr', maxWidth: 520 }}>
        <div className="auth-left">
          <div className="auth-brand">
            <div className="logo big">CB</div>
            <div>
              <div className="auth-title">Cloud Balance</div>
              <div className="auth-sub">Sign in to manage projects</div>
            </div>
          </div>

          <div className="toggle-row">
            <button
              type="button"
              className={'pill ' + (mode === 'signin' ? 'active' : '')}
              onClick={() => setMode('signin')}
            >
              Sign In
            </button>
            <button
              type="button"
              className={'pill ' + (mode === 'signup' ? 'active' : '')}
              onClick={() => setMode('signup')}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={submit} className="auth-form">
            {mode === 'signup' && (
              <label className="field">
                <span>Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                />
              </label>
            )}

            <label className="field">
              <span>Email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                type="email"
                required
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type="password"
                required
              />
            </label>

            {error && <div className="error">{error}</div>}

            <button className="btn primary" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="auth-foot">Tip: password must be at least 6 characters.</div>
        </div>
      </div>
    </div>
  );
}