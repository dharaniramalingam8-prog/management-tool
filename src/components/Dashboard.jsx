import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, CheckSquare, Folder, Users, Bell, 
  LogOut, X, Moon, Sun 
} from 'lucide-react';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [dashboardStats, setDashboardStats] = useState({ overdueTasks: [], workload: [] });
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Modal Fields
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [error, setError] = useState('');

  // Theme state
  const [isLightMode, setIsLightMode] = useState(
    localStorage.getItem('theme') === 'light'
  );

  useEffect(() => {
    if (isLightMode) {
      document.body.classList.add('light-theme');
      localStorage.setItem('theme', 'light');
    } else {
      document.body.classList.remove('light-theme');
      localStorage.setItem('theme', 'dark');
    }
  }, [isLightMode]);

  // Fetch Projects & Notifications
  useEffect(() => {
    async function fetchData() {
      try {
        const projData = await api.get('/projects');
        setProjects(projData);

        const notifData = await api.get('/notifications');
        setNotifications(notifData);

        const statsData = await api.get('/dashboard/stats');
        setDashboardStats(statsData);
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
          <span>Project Nexus</span>
        </div>

        <div className="nav-actions">
          {/* Theme Toggle */}
          <button 
            className="btn btn-secondary btn-icon" 
            onClick={() => setIsLightMode(!isLightMode)}
            title="Toggle Theme"
          >
            {isLightMode ? <Moon size={18} /> : <Sun size={18} />}
          </button>

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
        <div className="section-header" style={{ marginTop: '20px' }}>
          <h2>Forecast & Risk Analysis</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '32px' }}>
          {/* Overdue Tasks Panel */}
          <div className="glass-panel" style={{ borderTop: '4px solid var(--priority-high)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: 'var(--priority-high)' }}>
              <Bell size={18} /> Overdue Tasks ({dashboardStats.overdueTasks.length})
            </h3>
            {dashboardStats.overdueTasks.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No overdue tasks! You're all caught up.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto' }}>
                {dashboardStats.overdueTasks.map(task => {
                  const daysOverdue = Math.floor((new Date() - new Date(task.due_date)) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={task.id} style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid var(--priority-high)' }}>
                      <div style={{ fontWeight: '500', fontSize: '0.95rem' }}>{task.title}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Project: {task.project_name}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--priority-high)', marginTop: '4px', fontWeight: '600' }}>
                        {daysOverdue} days overdue
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Workload Distribution Panel */}
          <div className="glass-panel" style={{ borderTop: '4px solid var(--primary)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Users size={18} color="var(--primary)" /> Team Workload
            </h3>
            {dashboardStats.workload.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No tasks assigned.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto' }}>
                {dashboardStats.workload.map((member, idx) => (
                  <div key={member.id} style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="avatar" style={{ width: '36px', height: '36px', fontSize: '1rem', flexShrink: 0 }}>
                      {member.username.substring(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '500', display: 'flex', justifyContent: 'space-between' }}>
                        <span>
                          {member.username} 
                          {idx === 0 && <span style={{ marginLeft: '8px', fontSize: '0.75rem', background: 'var(--primary-glow)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '4px' }}>🏆 Top Contributor</span>}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{member.task_count * 10} pts</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {member.task_count} tasks assigned
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

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
                <div className="project-meta" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Progress ({p.completed_tasks || 0}/{p.total_tasks || 0})</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                      {p.total_tasks > 0 ? Math.round((p.completed_tasks / p.total_tasks) * 100) : 0}%
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--primary)', width: `${p.total_tasks > 0 ? Math.round((p.completed_tasks / p.total_tasks) * 100) : 0}%`, transition: 'width 0.3s ease' }}></div>
                  </div>
                </div>
                <div className="project-meta" style={{ marginTop: '12px' }}>
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
