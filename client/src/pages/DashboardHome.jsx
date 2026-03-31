import React from 'react';
import { api } from '../api';
import { Link, useNavigate } from 'react-router-dom';

const PROJECT_ICONS = ['🌐', '⚡', '🗄️', '📊', '🚀', '🔧', '🤖', '💡'];
const STATUS_COLORS = {
  running: { bg: '#dcfce7', color: '#16a34a', dot: '#22c55e', label: '● Healthy' },
  scaling: { bg: '#fef9c3', color: '#ca8a04', dot: '#eab308', label: '⟳ Scaling' },
  overloaded: { bg: '#fee2e2', color: '#dc2626', dot: '#ef4444', label: '⚠ Overloaded' },
  deploying: { bg: '#fef3c7', color: '#d97706', dot: '#f59e0b', label: '⟳ Deploying' },
};

function getProjectStatus(project, pods) {
  const projectPods = pods.filter(pod => pod.name.startsWith(`project-${project.id}`));
  const running = projectPods.filter(p => p.status === 'Running').length;
  if (running === 0) return 'deploying';
  if (running > 0) return 'running';
  return 'deploying';
}

function StatCard({ label, value, hint, hintColor }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '16px',
      padding: '24px',
      border: '1px solid #e5e7eb',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '36px', fontWeight: '700', color: '#111827', lineHeight: 1 }}>{value}</div>
      {hint && <div style={{ fontSize: '13px', color: hintColor || '#10b981', marginTop: '8px', fontWeight: '500' }}>{hint}</div>}
    </div>
  );
}

function ProjectCard({ project, pods, onClick, index }) {
  const status = getProjectStatus(project, pods);
  const statusStyle = STATUS_COLORS[status] || STATUS_COLORS.deploying;
  const projectPods = pods.filter(pod => pod.name.startsWith(`project-${project.id}`));
  const runningPods = projectPods.filter(p => p.status === 'Running').length;
  const icon = PROJECT_ICONS[index % PROJECT_ICONS.length];

  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        borderRadius: '16px',
        padding: '24px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.borderColor = '#3b82f6';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = '#e5e7eb';
      }}
    >
      {/* Status badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '12px',
          background: '#f3f4f6', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '22px'
        }}>{icon}</div>
        <span style={{
          padding: '4px 12px', borderRadius: '20px', fontSize: '12px',
          fontWeight: '600', background: statusStyle.bg, color: statusStyle.color
        }}>{statusStyle.label}</span>
      </div>

      {/* Project name */}
      <div style={{ fontWeight: '700', fontSize: '17px', color: '#111827', marginBottom: '4px' }}>{project.name}</div>
      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '20px' }}>
        {project.docker_image} · K8s cluster · {project.mode || 'Manual'}
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '24px', borderTop: '1px solid #f3f4f6', paddingTop: '16px' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase' }}>Pods</div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: '#111827' }}>{runningPods}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase' }}>CPU</div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: '#111827' }}>—</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase' }}>Uptime</div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: '#111827' }}>—</div>
        </div>
      </div>
    </div>
  );
}

// Delete Modal Component
function DeleteProjectModal({ projects, onClose, onDelete }) {
  const [selectedId, setSelectedId] = React.useState('');
  const [deleting, setDeleting] = React.useState(false);

  const handleDelete = async () => {
    if (!selectedId) return;
    
    const project = projects.find(p => p.id === selectedId);
    if (!project) return;

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete "${project.name}"?\n\n` +
      `This will:\n` +
      `• Stop all running pods\n` +
      `• Delete the Kubernetes deployment\n` +
      `• Remove all project data\n\n` +
      `This action cannot be undone.`
    );

    if (!confirmed) return;

    setDeleting(true);
    try {
      await onDelete(selectedId);
      onClose();
    } catch (error) {
      alert('Failed to delete: ' + error.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>Delete Project</div>
        <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
          Select a project to permanently delete
        </div>

        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontSize: '14px',
            marginBottom: '24px',
            cursor: 'pointer',
          }}
        >
          <option value="">Choose a project...</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.docker_image})
            </option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#374151',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!selectedId || deleting}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              background: selectedId && !deleting ? '#dc2626' : '#fca5a5',
              color: '#fff',
              fontWeight: '600',
              cursor: selectedId && !deleting ? 'pointer' : 'not-allowed',
            }}
          >
            {deleting ? 'Deleting...' : 'Delete Project'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardHome({ auth }) {
  const navigate = useNavigate();
  const [projects, setProjects] = React.useState([]);
  const [pods, setPods] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);

  const fetchData = async () => {
    setError('');
    try {
      const { projects } = await api.listProjects();
      setProjects(projects);
      const res = await fetch('http://localhost:5001/projects/pods', { credentials: 'include' });
      const data = await res.json();
      setPods(data.pods || []);
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (projectId) => {
    await api.deleteProject(projectId);
    
    // Show success message
    const successMsg = document.createElement('div');
    successMsg.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #dcfce7;
      color: #16a34a;
      padding: 16px 24px;
      borderRadius: 12px;
      fontWeight: 600;
      fontSize: 14px;
      boxShadow: 0 8px 24px rgba(0,0,0,0.12);
      zIndex: 9999;
      border: 1px solid #86efac;
    `;
    const project = projects.find(p => p.id === projectId);
    successMsg.textContent = `✓ "${project?.name}" deleted successfully`;
    document.body.appendChild(successMsg);
    
    setTimeout(() => successMsg.remove(), 3000);

    // Refresh data
    await fetchData();
  };

  React.useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const activePods = pods.filter(p => p.status === 'Running').length;
  const userName = auth?.user?.name || auth?.user?.email?.split('@')[0] || 'User';

  return (
    <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: '#111827' }}>Dashboard</div>
          <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '2px' }}>Welcome back, {userName}</div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {/* Delete Project Button */}
          {projects.length > 0 && (
            <button
              onClick={() => setShowDeleteModal(true)}
              style={{
                background: '#fee2e2',
                color: '#dc2626',
                padding: '10px 20px',
                borderRadius: '10px',
                fontWeight: '600',
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#fecaca'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#fee2e2'}
            >
               Delete Project
            </button>
          )}
          <Link to="/create" style={{
            background: '#2563eb', color: '#fff', padding: '10px 20px',
            borderRadius: '10px', fontWeight: '600', fontSize: '14px',
            textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px'
          }}>+ New Project</Link>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
        <StatCard label="Total Projects" value={loading ? '—' : projects.length}
          hint={`↑ ${projects.length} this session`} />
        <StatCard label="Active Pods" value={loading ? '—' : activePods}
          hint="Across all clusters" />
        <StatCard label="Avg CPU Load" value="—" hint="Connect metrics server" hintColor="#6b7280" />
        <StatCard label="Energy Score" value="—" hint="Good efficiency" hintColor="#6b7280" />
      </div>

      {/* Projects */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '18px', fontWeight: '700', color: '#111827' }}>Your Projects</div>
      </div>

      {loading && <div style={{ color: '#6b7280', padding: '40px', textAlign: 'center' }}>Loading…</div>}
      {error && <div style={{ color: '#dc2626', padding: '16px', background: '#fee2e2', borderRadius: '8px' }}>{error}</div>}

      {!loading && !error && projects.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚀</div>
          <div style={{ fontWeight: '600', marginBottom: '8px' }}>No projects yet</div>
          <Link to="/create" style={{ color: '#2563eb', fontWeight: '600' }}>Create your first project</Link>
        </div>
      )}

      {!loading && !error && projects.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {projects.map((p, i) => (
            <ProjectCard
              key={p.id}
              project={p}
              pods={pods}
              index={i}
              onClick={() => navigate(`/projects/${p.id}`)}
            />
          ))}
          {/* New Project Card */}
          <div
            onClick={() => navigate('/create')}
            style={{
              borderRadius: '16px', padding: '24px',
              border: '2px dashed #93c5fd', cursor: 'pointer',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              minHeight: '200px', transition: 'all 0.2s',
              background: '#eff6ff',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#dbeafe'}
            onMouseLeave={e => e.currentTarget.style.background = '#eff6ff'}
          >
            <div style={{ fontSize: '32px', color: '#3b82f6', marginBottom: '8px' }}>+</div>
            <div style={{ fontWeight: '700', color: '#2563eb', fontSize: '16px' }}>New Project</div>
            <div style={{ fontSize: '13px', color: '#60a5fa', marginTop: '4px' }}>Deploy a containerized app</div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <DeleteProjectModal
          projects={projects}
          onClose={() => setShowDeleteModal(false)}
          onDelete={handleDeleteProject}
        />
      )}
    </div>
  );
}
