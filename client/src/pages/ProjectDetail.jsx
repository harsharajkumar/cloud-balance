import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';

function MiniChart({ data, color = '#3b82f6', height = 120 }) {
  if (!data || data.length < 2) return (
    <div style={{ height, display: 'flex', alignItems: 'center', color: '#9ca3af', fontSize: '12px' }}>
      Collecting data…
    </div>
  );
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 300, h = height;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 8) - 4;
    return `${x},${y}`;
  }).join(' ');
  const fillPoints = `0,${h} ${points} ${w},${h}`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill="url(#cpuGrad)" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function MetricCard({ icon, label, value, sub, color = '#111827' }) {
  return (
    <div style={{
      background: '#fff', borderRadius: '14px', padding: '20px',
      border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '16px'
    }}>
      <div style={{
        width: '44px', height: '44px', borderRadius: '12px', background: '#f3f4f6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '20px', flexShrink: 0
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ fontSize: '26px', fontWeight: '700', color, lineHeight: 1.2 }}>{value}</div>
        {sub && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pods, setPods] = React.useState([]);
  const [project, setProject] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [cpuHistory, setCpuHistory] = React.useState([]);
  const [realMetrics, setRealMetrics] = React.useState(null);
  const [scalingEvents, setScalingEvents] = React.useState([]);
  const [lastUpdated, setLastUpdated] = React.useState(new Date());
  const [alertDismissed, setAlertDismissed] = React.useState(false);
  
  // Auto-scaling state
  const [autoScalingActive, setAutoScalingActive] = React.useState(false);
  const [scalingHistory, setScalingHistory] = React.useState([]);
  const [currentTraffic, setCurrentTraffic] = React.useState(null);

  const fetchAll = async () => {
    try {
      // 1. Project info
      const projRes = await fetch('http://localhost:5001/projects', { credentials: 'include' });
      const projData = await projRes.json();
      const found = (projData.projects || []).find(p => p.id === id);
      if (found) setProject(found);

      // 2. Pods
      const podsRes = await fetch('http://localhost:5001/projects/pods', { credentials: 'include' });
      const podsData = await podsRes.json();
      const myPods = (podsData.pods || []).filter(pod => pod.name.startsWith(`project-${id}`));
      setPods(myPods);

      // 3. Real CPU/Memory from K8s Metrics Server
      const metricsRes = await fetch(`http://localhost:5001/projects/${id}/metrics`, { credentials: 'include' });
      const metricsData = await metricsRes.json();
      if (metricsData.avgCpuMillicores !== undefined) {
        setRealMetrics(metricsData);
        const cpuPct = Math.min(Math.round(metricsData.avgCpuMillicores / 10), 100);
        setCpuHistory(prev => [...prev.slice(-29), cpuPct]);
      }

      // 4. Real K8s Events
      const eventsRes = await fetch(`http://localhost:5001/projects/${id}/events`, { credentials: 'include' });
      const eventsData = await eventsRes.json();
      if (eventsData.events && eventsData.events.length > 0) {
        setScalingEvents(eventsData.events);
      }

      // 5. Scaling History
      const historyRes = await fetch(`http://localhost:5001/projects/${id}/scaling-history`, {
        credentials: 'include'
      });
      const historyData = await historyRes.json();
      if (historyData.events) {
        setScalingHistory(historyData.events);
      }

      setLastUpdated(new Date());
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, [id]);

  // Start Auto-Scaling
  const handleStartAutoScale = async () => {
    try {
      const res = await fetch(`http://localhost:5001/projects/${id}/start-autoscale`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalSeconds: 10 })
      });
      
      if (res.ok) {
        setAutoScalingActive(true);
        alert('✅ Auto-scaling started! Your deployment will scale based on traffic data every 10 seconds.');
      } else {
        const error = await res.json();
        alert('Failed to start auto-scaling: ' + error.error);
      }
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  // Stop Auto-Scaling
  const handleStopAutoScale = async () => {
    try {
      const res = await fetch(`http://localhost:5001/projects/${id}/stop-autoscale`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (res.ok) {
        setAutoScalingActive(false);
        alert('⏹️ Auto-scaling stopped');
      }
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  // Trigger Single Scaling Event
  const handleManualScale = async () => {
    try {
      const res = await fetch(`http://localhost:5001/projects/${id}/simulate`, {
        method: 'POST',
        credentials: 'include'
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setCurrentTraffic(data);
        alert(`📊 Scaling Decision:\n` +
              `Traffic: ${data.trafficData.requests_per_sec} req/s\n` +
              `Replicas: ${data.scaling.previousReplicas} → ${data.scaling.requiredReplicas}\n` +
              `Action: ${data.scaling.scaled ? 'Scaled!' : 'No change needed'}`);
        fetchAll(); // Refresh to see new pod count
      } else {
        alert('Failed: ' + data.error);
      }
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const runningPods = pods.filter(p => p.status === 'Running').length;
  const currentCpuMillicores = realMetrics?.avgCpuMillicores ?? 0;
  const currentCpuPct = Math.min(Math.round(currentCpuMillicores / 10), 100);
  const totalMemMB = realMetrics?.metrics?.reduce((s, m) => s + m.memoryMB, 0) ?? 0;
  const clusterStatus = runningPods > 0 ? 'Healthy' : 'Deploying';
  const clusterColor = runningPods > 0 ? '#16a34a' : '#d97706';

  const displayEvents = scalingEvents.length > 0
    ? scalingEvents.map(e => ({
        event: e.message || e.reason,
        time: e.time ? new Date(e.time).toLocaleTimeString() : 'recent',
        color: e.type === 'Normal' ? '#16a34a' : '#dc2626'
      }))
    : [
        { event: `${runningPods} pod${runningPods !== 1 ? 's' : ''} running`, time: 'Just now', color: '#16a34a' },
        { event: 'Deployment created', time: project?.created_at ? new Date(project.created_at).toLocaleTimeString() : '—', color: '#3b82f6' }
      ];

  return (
    <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <button onClick={() => navigate('/')} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280',
          fontSize: '14px', padding: 0, marginBottom: '8px',
          display: 'flex', alignItems: 'center', gap: '4px'
        }}>← Back to Dashboard</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#111827' }}>Real-Time Monitor</div>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              {project?.name || `Project ${id.slice(0, 8)}`} · K8s Cluster
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', color: '#9ca3af' }}>Last updated: {lastUpdated.toLocaleTimeString()}</div>
            <div style={{ fontSize: '11px', color: '#d1d5db' }}>auto-refreshes every 10s</div>
          </div>
        </div>
      </div>

      {/* Alert */}
      {runningPods > 0 && !alertDismissed && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '12px',
          padding: '16px 20px', marginBottom: '24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '20px' }}>⚡</span>
            <div>
              <div style={{ fontWeight: '700', color: '#92400e', fontSize: '14px' }}>
                🟢 Deployment Active — {runningPods} Pod{runningPods !== 1 ? 's' : ''} Running
              </div>
              <div style={{ fontSize: '13px', color: '#92400e', marginTop: '2px' }}>
                {project?.mode || 'ML'} model managing auto-scaling · CPU: {currentCpuMillicores}m cores
                {totalMemMB > 0 ? ` · Memory: ${totalMemMB}MB` : ''}
              </div>
            </div>
          </div>
          <button onClick={() => setAlertDismissed(true)} style={{
            background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '8px',
            padding: '6px 14px', cursor: 'pointer', fontWeight: '600', fontSize: '13px'
          }}>✓ Acknowledged</button>
        </div>
      )}

      {/* Auto-Scaling Control Panel */}
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        padding: '24px',
        border: '1px solid #e5e7eb',
        marginBottom: '24px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <div>
            <div style={{ fontWeight: '700', fontSize: '16px', color: '#111827' }}>
              Auto-Scaling Control
            </div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
              Dataset-driven auto-scaling based on traffic patterns
            </div>
          </div>
          <div style={{
            padding: '6px 16px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: '600',
            background: autoScalingActive ? '#dcfce7' : '#f3f4f6',
            color: autoScalingActive ? '#16a34a' : '#6b7280'
          }}>
            {autoScalingActive ? '● Active' : '○ Inactive'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {!autoScalingActive ? (
            <button
              onClick={handleStartAutoScale}
              style={{
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                padding: '10px 20px',
                fontWeight: '600',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              ▶️ Start Auto-Scaling
            </button>
          ) : (
            <button
              onClick={handleStopAutoScale}
              style={{
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                padding: '10px 20px',
                fontWeight: '600',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              ⏹️ Stop Auto-Scaling
            </button>
          )}

          <button
            onClick={handleManualScale}
            style={{
              background: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '10px',
              padding: '10px 20px',
              fontWeight: '600',
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            🎯 Simulate One Step
          </button>
        </div>

        {/* Current Traffic Data */}
        {currentTraffic && (
          <div style={{
            marginTop: '16px',
            padding: '16px',
            background: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: '10px'
          }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#166534', marginBottom: '8px' }}>
              Latest Scaling Decision
            </div>
            <div style={{ fontSize: '12px', color: '#166534' }}>
              Traffic: <strong>{currentTraffic.trafficData.requests_per_sec} req/s</strong> →
              Replicas: <strong>{currentTraffic.scaling.previousReplicas} → {currentTraffic.scaling.requiredReplicas}</strong>
              {currentTraffic.scaling.scaled ? ' (Scaled ✅)' : ' (No change)'}
            </div>
          </div>
        )}

        {/* Scaling Rules */}
        <div style={{
          marginTop: '16px',
          padding: '12px',
          background: '#eff6ff',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#1e40af'
        }}>
          <strong>Scaling Rules:</strong> ≤50 req/s = 1 pod | ≤120 = 2 pods | ≤200 = 3 pods | &gt;200 = 4 pods
        </div>

        {/* Scaling History */}
        {scalingHistory.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>
              Recent Scaling Events ({scalingHistory.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
              {scalingHistory.slice(0, 10).map((event, i) => (
                <div key={i} style={{
                  padding: '10px 12px',
                  background: '#f9fafb',
                  borderRadius: '8px',
                  fontSize: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <strong>{event.requests_per_sec} req/s</strong> →
                    Scaled from {event.old_replicas} to {event.new_replicas} pods
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>
                    {new Date(event.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <MetricCard icon="🖥️" label="Current Pods" value={loading ? '—' : runningPods} sub="Active containers" />
        <MetricCard icon="🟢" label="Cluster Status" value={loading ? '—' : clusterStatus}
          sub="K8s default namespace" color={clusterColor} />
        <MetricCard icon="⚡" label="Avg CPU"
          value={realMetrics ? `${currentCpuMillicores}m` : '—'}
          sub={realMetrics ? `≈${currentCpuPct}% utilization` : 'Fetching from K8s...'}
          color={currentCpuPct > 80 ? '#dc2626' : '#111827'} />
        <MetricCard icon="💾" label="Memory"
          value={totalMemMB > 0 ? `${totalMemMB}MB` : '—'}
          sub="Across all pods" />
      </div>

      {/* Chart + Events */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontWeight: '700', fontSize: '16px', color: '#111827' }}>CPU Usage Over Time</div>
            <span style={{
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '600',
              background: '#dcfce7', color: '#16a34a', padding: '4px 10px', borderRadius: '20px'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
              Live
            </span>
          </div>
          {cpuHistory.length < 2
            ? <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '13px' }}>
                Collecting real-time data… (updates every 10s)
              </div>
            : <MiniChart data={cpuHistory} color="#3b82f6" height={120} />
          }
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
            <div style={{ width: '20px', height: '2px', background: '#3b82f6', borderRadius: '2px' }}></div>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>
              Real CPU (millicores from K8s) · {cpuHistory.length} data points
            </span>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontWeight: '700', fontSize: '16px', color: '#111827', marginBottom: '16px' }}>
            {scalingEvents.length > 0 ? '⚡ K8s Events' : 'Scaling History'}
          </div>
          {displayEvents.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, marginTop: '5px', flexShrink: 0 }}></div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827', wordBreak: 'break-word' }}>{item.event}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{item.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pods Table */}
      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: '700', fontSize: '16px', color: '#111827' }}>
            Pods <span style={{ fontSize: '13px', fontWeight: '500', color: '#6b7280' }}>({pods.length} total)</span>
          </div>
          <button onClick={fetchAll} style={{
            background: '#f3f4f6', border: 'none', borderRadius: '8px',
            padding: '6px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#374151'
          }}>↻ Refresh</button>
        </div>

        {loading && <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading pods…</div>}

        {!loading && pods.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>⏳</div>
            No pods found for this project yet.
          </div>
        )}

        {!loading && pods.length > 0 && (
          <div>
            <div style={{
              display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
              padding: '12px 24px', background: '#f9fafb',
              fontSize: '11px', fontWeight: '700', color: '#6b7280',
              textTransform: 'uppercase', letterSpacing: '0.05em'
            }}>
              <div>Pod Name</div><div>Status</div><div>Ready</div><div>CPU</div><div>Memory</div>
            </div>
            {pods.map((pod) => {
              const podMetric = realMetrics?.metrics?.find(m => m.podName === pod.name);
              return (
                <div key={pod.name} style={{
                  display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                  padding: '16px 24px', borderTop: '1px solid #f3f4f6', alignItems: 'center'
                }}>
                  <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#374151', wordBreak: 'break-all' }}>{pod.name}</div>
                  <div>
                    <span style={{
                      padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
                      background: pod.status === 'Running' ? '#dcfce7' : '#fef3c7',
                      color: pod.status === 'Running' ? '#16a34a' : '#d97706'
                    }}>
                      {pod.status === 'Running' ? '● Running' : '⟳ ' + pod.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '14px' }}>{pod.ready ? '✅ Yes' : '⏳ No'}</div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                    {podMetric ? `${podMetric.cpuMillicores}m` : '—'}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                    {podMetric ? `${podMetric.memoryMB}MB` : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}