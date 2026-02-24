import React from 'react';
import { api } from '../api';
import { Link, useNavigate } from 'react-router-dom';

function Stat({ label, value, hint }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export default function DashboardHome() {
  const navigate = useNavigate();
  const [projects, setProjects] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let ok = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { projects } = await api.listProjects();
        if (ok) setProjects(projects);
      } catch (e) {
        if (ok) setError(e.message || 'Failed to load projects');
      } finally {
        if (ok) setLoading(false);
      }
    })();
    return () => { ok = false; };
  }, []);

  // Calculate REAL stats from projects
  const total = projects.length;
  const totalPods = projects.reduce((sum, p) => sum + (p.current_replicas || 0), 0);

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <div className="h1">Dashboard</div>
          <div className="sub">Overview of your projects</div>
        </div>
        <Link className="btn primary" to="/create">＋ New Project</Link>
      </header>

      <section className="grid stats">
        <Stat 
          label="Total Projects" 
          value={loading ? '—' : total} 
          hint={total === 0 ? "No projects yet" : `${total} ${total === 1 ? 'project' : 'projects'} deployed`} 
        />
        <Stat 
          label="Active Pods" 
          value={loading ? '—' : totalPods} 
          hint="Across all clusters" 
        />
        <Stat 
          label="Avg CPU Load" 
          value="—" 
           
        />
        <Stat 
          label="Energy Score" 
          value="—" 
          
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <div className="h2">Your Projects</div>
        </div>

        {loading && <div className="panel-body">Loading…</div>}
        
        {error && (
          <div className="panel-body">
            <div className="error">{error}</div>
          </div>
        )}
        
        {!loading && !error && projects.length === 0 && (
          <div className="panel-body">
            <div className="empty">
              
              <div className="empty-sub">Create your project to get started.</div>
              <Link className="btn primary" to="/create">Create Project</Link>
            </div>
          </div>
        )}
        
        {!loading && !error && projects.length > 0 && (
          <div className="table">
            <div className="row head">
              <div>Name</div>
              <div>Status</div>
              <div>Mode</div>
              <div>Image</div>
              <div>Replicas</div>
              <div>Created</div>
            </div>
            {projects.map((p) => (
              <div 
                className="row" 
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                style={{cursor: 'pointer'}}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div className="mono" style={{fontWeight: '600'}}>{p.name}</div>
                <div>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: '600',
                    background: p.status === 'running' ? '#dcfce7' : '#fef3c7',
                    color: p.status === 'running' ? '#16a34a' : '#d97706'
                  }}>
                    {p.status === 'running' ? '● Running' : '⟳ Deploying'}
                  </span>
                </div>
                <div>{p.mode || 'manual'}</div>
                <div className="mono" style={{fontSize: '13px', color: '#6b7280'}}>
                  {p.docker_image || '—'}
                </div>
                <div>
                  <span style={{fontWeight: '600'}}>{p.current_replicas || 0}</span>
                  <span style={{color: '#9ca3af'}}> ({p.min_replicas}–{p.max_replicas})</span>
                </div>
                <div style={{fontSize: '13px', color: '#6b7280'}}>
                  {new Date(p.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}