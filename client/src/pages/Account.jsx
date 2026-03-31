import React from 'react';
import { api } from '../api';

export default function Account({ auth }) {
  const [name, setName] = React.useState(auth.user?.name || '');
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const [err, setErr] = React.useState('');

  React.useEffect(() => {
    setName(auth.user?.name || '');
  }, [auth.user]);

  async function save(e) {
    e.preventDefault();
    setMsg('');
    setErr('');
    setBusy(true);
    try {
      const { user } = await api.updateMe(name.trim());
      auth.setUser(user);
      setMsg('Saved.');
    } catch (e) {
      setErr(e.message || 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <div className="h1">Account</div>
          <div className="sub">Your profile information</div>
        </div>
      </header>

      <section className="panel">
        <div className="panel-body">
          <form className="form" onSubmit={save}>
            <div className="form-row">
              <label className="field">
                <span>Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="field">
                <span>Email</span>
                <input value={auth.user?.email || ''} disabled />
              </label>
            </div>

            {msg && <div className="success">{msg}</div>}
            {err && <div className="error">{err}</div>}

            <div className="actions">
              <button className="btn primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
