import React from 'react';
import { api } from '../api';
import { useNavigate } from 'react-router-dom';

export default function NewProject() {
  const navigate = useNavigate();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [dockerImage, setDockerImage] = React.useState('');
  const [dockerFile, setDockerFile] = React.useState(null);
  const [configFile, setConfigFile] = React.useState(null);
  const [mode, setMode] = React.useState('random_forest');
  const [initialReplicas, setInitialReplicas] = React.useState(2);
  const [minReplicas, setMinReplicas] = React.useState(1);
  const [maxReplicas, setMaxReplicas] = React.useState(20);
  const [autoScaling, setAutoScaling] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  // Handle Docker file upload
  const handleDockerUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setDockerFile(file);
      setDockerImage(''); // Clear text input when file is selected
    }
  };

  // Handle config file upload
  const handleConfigUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setConfigFile(file);
    }
  };

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    
    try {
      await api.createProject({
        name: name.trim(),
        description: description.trim(),
        dockerImage: dockerImage.trim() || dockerFile?.name,
        mode,
        initialReplicas: Number(initialReplicas),
        minReplicas: Number(minReplicas),
        maxReplicas: Number(maxReplicas),
        autoScaling,
        // TODO: Handle file uploads in Sprint 3
        dockerFile: dockerFile,
        configFile: configFile,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Failed to create project');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <div className="h1">New Project</div>
          <div className="sub">Create a project with basic configuration</div>
        </div>
      </header>

      <section className="panel">
        <div className="panel-body">
          <form className="form" onSubmit={submit}>
            
            {/* Project Details */}
            <div className="form-row">
              <label className="field">
                <span>Project name</span>
                <input 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="e.g., my-service" 
                  required 
                />
              </label>
            </div>

            <label className="field">
              <span>Description</span>
              <input 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
                placeholder="Short description (optional)" 
              />
            </label>

            {/* Docker Image */}
            <div className="field">
              <span>Docker image</span>
              
              {/* File upload option */}
              <input 
                type="file" 
                id="dockerUpload" 
                accept=".tar,.tar.gz,.tgz"
                style={{display:'none'}}
                onChange={handleDockerUpload}
              />
              
              <div 
                onClick={() => document.getElementById('dockerUpload').click()}
                style={{
                  border: '2px dashed #ccc',
                  borderRadius: '8px',
                  padding: '20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  marginBottom: '12px',
                  background: dockerFile ? '#f0fdf4' : '#f9fafb'
                }}
              >
                <div style={{fontSize: '24px', marginBottom: '8px'}}>🐳</div>
                <div style={{fontSize: '14px', fontWeight: '600'}}>
                  {dockerFile ? `✓ ${dockerFile.name}` : 'Click to upload Docker image'}
                </div>
                <div style={{fontSize: '12px', color: '#6b7280', marginTop: '4px'}}>
                  .tar, .tar.gz files supported
                </div>
              </div>

              {dockerFile && (
                <button 
                  type="button"
                  onClick={() => setDockerFile(null)}
                  style={{fontSize: '12px', marginBottom: '12px'}}
                >
                  ✕ Remove file
                </button>
              )}

              {/* Or text input */}
              <div style={{textAlign: 'center', fontSize: '12px', color: '#6b7280', margin: '12px 0'}}>
                — or enter image name —
              </div>
              
              <input 
                value={dockerImage} 
                onChange={(e) => setDockerImage(e.target.value)} 
                placeholder="e.g., nginx:latest"
                disabled={dockerFile !== null}
              />
            </div>

            {/* Config File */}
            <div className="field">
              <span>Configuration (optional)</span>
              
              <input 
                type="file" 
                id="configUpload" 
                accept=".yaml,.yml"
                style={{display:'none'}}
                onChange={handleConfigUpload}
              />
              
              <div 
                onClick={() => document.getElementById('configUpload').click()}
                style={{
                  border: '2px dashed #ccc',
                  borderRadius: '8px',
                  padding: '20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: configFile ? '#f0fdf4' : '#f9fafb'
                }}
              >
                <div style={{fontSize: '24px', marginBottom: '8px'}}>⚙️</div>
                <div style={{fontSize: '14px', fontWeight: '600'}}>
                  {configFile ? `✓ ${configFile.name}` : 'Upload config.yaml'}
                </div>
                <div style={{fontSize: '12px', color: '#6b7280', marginTop: '4px'}}>
                  Kubernetes cluster & scaling config
                </div>
              </div>

              {configFile && (
                <button 
                  type="button"
                  onClick={() => setConfigFile(null)}
                  style={{fontSize: '12px', marginTop: '12px'}}
                >
                  ✕ Remove file
                </button>
              )}
            </div>

            {/* Replicas */}
            <div className="form-row">
              <label className="field">
                <span>Initial replicas</span>
                <input 
                  type="number" 
                  min="1" 
                  max="50" 
                  value={initialReplicas} 
                  onChange={(e) => setInitialReplicas(e.target.value)} 
                />
              </label>
              <label className="field">
                <span>Min replicas</span>
                <input 
                  type="number" 
                  min="1" 
                  max="50" 
                  value={minReplicas} 
                  onChange={(e) => setMinReplicas(e.target.value)} 
                />
              </label>
              <label className="field">
                <span>Max replicas</span>
                <input 
                  type="number" 
                  min="1" 
                  max="200" 
                  value={maxReplicas} 
                  onChange={(e) => setMaxReplicas(e.target.value)} 
                />
              </label>
            </div>

            {/* Auto-Scaling */}
            <div className="field">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                <span>Enable Auto-Scaling</span>
                <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer'}}>
                  <input 
                    type="checkbox" 
                    checked={autoScaling}
                    onChange={(e) => setAutoScaling(e.target.checked)}
                    style={{marginRight: '8px'}}
                  />
                  <span style={{fontSize: '14px'}}>{autoScaling ? 'On' : 'Off'}</span>
                </label>
              </div>

              <label className="field">
                <span>Prediction Model</span>
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="manual">Manual (no auto-scaling)</option>
                  <option value="linear_regression">Linear Regression</option>
                  <option value="cnn">CNN (Convolutional Neural Network)</option>
                  <option value="random_forest">Random Forest</option>
                </select>
              </label>
            </div>

            {error && <div className="error">{error}</div>}

            <div className="actions">
              <button className="btn" type="button" onClick={() => navigate(-1)}>
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                {busy ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}