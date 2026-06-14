import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useNavigate } from 'react-router-dom';
import { Plus, LogOut, Bell, Folder, CheckSquare, Users, X } from 'lucide-react';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Modal Fields
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch Projects & Notifications
  useEffect(() => {
    async function fetchData() {
      try {
        const projData = await api.get('/projects');
        setProjects(projData);

        const notifData = await api.get('/notifications');
        setNotifications(notifData);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      }
    }
    fetchData();
  }, []);

  // Listen for socket notifications
  useEffect(() => {
    if (!socket) return;
    
    socket.on('new-notification', (newNotif) => {
      setNotifications(prev => [newNotif, ...prev]);
    });

    return () => {
      socket.off('new-notification');
    };
  }, [socket]);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    setCreateLoading(true);
    setError('');

    try {
      const newProj = await api.post('/projects', {
        name: projectName,
        description: projectDesc
      });
      setProjects([newProj, ...projects]);
      setShowCreateModal(false);
      setProjectName('');
      setProjectDesc('');
      navigate(`/projects/${newProj.id}`);
    } catch (err) {
      setError(err.message || 'Failed to create project');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications(notifications.map(n => ({ ...n, is_read: 1 })));
    } catch (err) {
      console.error(err);
    }
  };

  const handleReadNotif = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="app-container">
      {/* Navbar */}
      <nav className="navbar">
        <div className="nav-logo" onClick={() => navigate('/')}>
          <CheckSquare size={24} style={{ color: 'var(--primary)' }} />
          <span>Antigravity Kanban</span>
        </div>

        <div className="nav-actions">
          {/* Notifications */}
          <div className="notification-bell-container" style={{ position: 'relative' }}>
            <button 
              className="btn btn-secondary btn-icon" 
              onClick={() => setShowNotifDropdown(!showNotifDropdown)}
            >
              <Bell size={18} />
            </button>
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount}</span>
            )}

            {showNotifDropdown && (
              <div className="notification-dropdown glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>Notifications</span>
                  {unreadCount > 0 && (
                    <button 
                      onClick={handleMarkAllRead}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '300px' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div 
                        key={n.id} 
                        className={`notification-item ${!n.is_read ? 'unread' : ''}`}
                        onClick={() => !n.is_read && handleReadNotif(n.id)}
                      >
                        <div style={{ fontWeight: '500', marginBottom: '2px' }}>{n.title}</div>
                        <div>{n.content}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {new Date(n.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile Info */}
          <div className="profile-pill">
            <div className="avatar">
              {user?.username ? user.username.substring(0, 2).toUpperCase() : 'U'}
            </div>
            <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{user?.username}</span>
          </div>

          {/* Logout */}
          <button className="btn btn-secondary" onClick={logout} style={{ padding: '8px 12px' }}>
            <LogOut size={16} />
            <span style={{ display: 'inline' }}>Logout</span>
          </button>
        </div>
      </nav>

      {/* Main Dashboard Panel */}
      <main className="dashboard">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h1>Welcome back, {user?.username}!</h1>
            <p>Here's what is happening with your projects today.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={18} /> New Project
          </button>
        </div>

        {/* Stats Grid */}
        <div className="stats-grid">
          <div className="stat-card glass-panel tasks">
            <div className="stat-icon"><Folder size={20} /></div>
            <div className="stat-info">
              <h3>{projects.length}</h3>
              <p>Total Projects</p>
            </div>
          </div>
          
          <div className="stat-card glass-panel active-proj">
            <div className="stat-icon"><Users size={20} /></div>
            <div className="stat-info">
              <h3>{projects.reduce((acc, p) => acc + (p.member_count || 1), 0)}</h3>
              <p>Total Collaborators</p>
            </div>
          </div>

          <div className="stat-card glass-panel due">
            <div className="stat-icon"><Bell size={20} /></div>
            <div className="stat-info">
              <h3>{unreadCount}</h3>
              <p>Unread Alerts</p>
            </div>
          </div>
        </div>

        {/* Projects Grid */}
        <div className="section-header">
          <h2>Your Projects</h2>
        </div>

        {projects.length === 0 ? (
          <div className="glass-panel empty-state">
            <Folder size={48} style={{ color: 'var(--text-secondary)' }} />
            <h3>No projects found</h3>
            <p>Create a new group project to start collaborating with your team.</p>
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={18} /> Create Project
            </button>
          </div>
        ) : (
          <div className="projects-grid">
            {projects.map(p => (
              <div 
                key={p.id} 
                className="project-card glass-panel" 
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                <h3>{p.name}</h3>
                <p className="project-desc">{p.description || 'No description provided.'}</p>
                <div className="project-meta">
                  <div className="project-members-avatars">
                    {Array.from({ length: Math.min(p.member_count || 1, 4) }).map((_, i) => (
                      <div key={i} className="project-member-avatar-overlap">
                        {i === 3 && (p.member_count || 1) > 4 ? `+${(p.member_count || 1) - 3}` : 'M'}
                      </div>
                    ))}
                  </div>
                  <span className="project-stat-pill">
                    ID: #{p.id}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowCreateModal(false)}>
              <X size={20} />
            </button>
            <h2 className="modal-title">Create Group Project</h2>
            {error && (
              <div style={{ color: 'var(--priority-high)', marginBottom: '16px', fontSize: '0.9rem' }}>{error}</div>
            )}
            <form onSubmit={handleCreateProject}>
              <div className="form-group">
                <label htmlFor="pname">Project Name</label>
                <input
                  id="pname"
                  type="text"
                  className="input-field"
                  placeholder="e.g. Website Redesign"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="pdesc">Description</label>
                <textarea
                  id="pdesc"
                  className="input-field"
                  placeholder="What is this project about?"
                  value={projectDesc}
                  onChange={(e) => setProjectDesc(e.target.value)}
                  style={{ minHeight: '100px', resize: 'vertical' }}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={createLoading}>
                  {createLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
