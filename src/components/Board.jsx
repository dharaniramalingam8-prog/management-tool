import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { 
  ArrowLeft, Plus, Settings, CheckSquare, Activity,
  MoreVertical, Clock, UserPlus, Users, Trash2, X, Bell, Moon, Sun, LogOut, MessageSquare, CheckSquare as CheckIcon, Calendar, Map, Layout, PieChart, Download
} from 'lucide-react';
import TaskModal from './TaskModal';
import ManageMembersModal from './ManageMembersModal';
import CalendarView from './CalendarView';
import AnalyticsView from './AnalyticsView';
import ActivityFeed from './ActivityFeed';

export default function Board() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const socket = useSocket();

  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [lists, setLists] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const currentUserRole = project?.owner_id === user?.id ? 'owner' : (members.find(m => m.id === user?.id)?.role || 'member');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [filterDueDate, setFilterDueDate] = useState('all');

  // View Mode
  const [viewMode, setViewMode] = useState('kanban'); // kanban | calendar | analytics

  // Selected task for modal
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  // Invite & Manage Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showManageMembers, setShowManageMembers] = useState(false);
  const [showMilestones, setShowMilestones] = useState(false);
  const [showActivityFeed, setShowActivityFeed] = useState(false);

  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteRole, setInviteRole] = useState('member');

  // New Column/List State
  const [showAddList, setShowAddList] = useState(false);
  const [newListName, setNewListName] = useState('');

  // Inline New Card State (key is listId, value is cardTitle)
  const [activeAddCardListId, setActiveAddCardListId] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const [notifications, setNotifications] = useState([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

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

  const fetchBoardData = useCallback(async () => {
    try {
      const data = await api.get(`/projects/${id}`);
      setProject(data.project);
      setMembers(data.members || []);
      setLists(data.lists || []);
      setMilestones(data.milestones || []);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError('Failed to load project details');
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchBoardData();
  }, [fetchBoardData]);

  // WebSocket Live Sync
  useEffect(() => {
    if (!socket || !id) return;

    socket.emit('join-project', id);

    socket.on('board-updated', (event) => {
      console.log('Board change detected:', event);
      fetchBoardData();
    });

    socket.on('project-deleted', () => {
      alert('This project has been deleted by the owner.');
      navigate('/');
    });

    return () => {
      socket.emit('leave-project', id);
      socket.off('board-updated');
      socket.off('project-deleted');
    };
  }, [socket, id, fetchBoardData]);

  // Notifications (navbar sync)
  useEffect(() => {
    async function fetchNotifs() {
      try {
        const notifData = await api.get('/notifications');
        setNotifications(notifData);
      } catch (err) {
        console.error(err);
      }
    }
    fetchNotifs();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('new-notification', (n) => {
      setNotifications(prev => [n, ...prev]);
    });
    return () => {
      socket.off('new-notification');
    };
  }, [socket]);

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications(notifications.map(n => ({ ...n, is_read: 1 })));
    } catch (err) {
      console.error(err);
    }
  };

  const handleReadNotif = async (notifId) => {
    try {
      await api.put(`/notifications/${notifId}/read`);
      setNotifications(notifications.map(n => n.id === notifId ? { ...n, is_read: 1 } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Drag End handler
  const onDragEnd = async (result) => {
    const { destination, source, draggableId, type } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    if (type === 'list') {
      const listId = parseInt(draggableId.split('-')[1]);
      const targetPosition = destination.index;

      const newLists = Array.from(lists);
      const [removed] = newLists.splice(source.index, 1);
      newLists.splice(destination.index, 0, removed);

      const updatedLists = newLists.map((l, index) => ({ ...l, position: index }));
      setLists(updatedLists);

      try {
        await api.put(`/lists/${listId}`, { position: targetPosition });
      } catch (err) {
        console.error('Failed to sync list drag & drop:', err);
      }
      return;
    }

    // Handle task move
    const taskId = parseInt(draggableId.split('-')[1]);
    const sourceListId = parseInt(source.droppableId.split('-')[1]);
    const destListId = parseInt(destination.droppableId.split('-')[1]);
    const targetPosition = destination.index;

    const sourceList = lists.find(l => l.id === sourceListId);
    const destList = lists.find(l => l.id === destListId);

    if (sourceListId === destListId) {
      const newTasks = Array.from(sourceList.tasks);
      const [removed] = newTasks.splice(source.index, 1);
      newTasks.splice(destination.index, 0, removed);

      const updatedTasks = newTasks.map((t, idx) => ({ ...t, position: idx }));
      setLists(lists.map(l => l.id === sourceListId ? { ...l, tasks: updatedTasks } : l));
    } else {
      const sourceTasks = Array.from(sourceList.tasks);
      const [removed] = sourceTasks.splice(source.index, 1);

      const updatedRemoved = { ...removed, list_id: destListId };

      const destTasks = Array.from(destList.tasks);
      destTasks.splice(destination.index, 0, updatedRemoved);

      setLists(lists.map(l => {
        if (l.id === sourceListId) {
          return { ...l, tasks: sourceTasks.map((t, idx) => ({ ...t, position: idx })) };
        }
        if (l.id === destListId) {
          return { ...l, tasks: destTasks.map((t, idx) => ({ ...t, position: idx })) };
        }
        return l;
      }));
    }

    try {
      await api.put(`/tasks/${taskId}`, {
        list_id: destListId,
        position: targetPosition
      });
    } catch (err) {
      console.error('Failed to sync task drag & drop:', err);
    }
  };

  const handleTaskDateChange = async (taskId, newDate) => {
    if (!newDate) return;
    try {
      await api.put(`/tasks/${taskId}`, {
        due_date: newDate.toISOString().split('T')[0]
      });
      fetchBoardData(); // Refresh to update Analytics and Kanban views
    } catch (err) {
      console.error('Failed to update task date:', err);
    }
  };

  // Add List Column
  const handleAddList = async (e) => {
    e.preventDefault();
    if (!newListName.trim()) return;

    try {
      const newList = await api.post(`/projects/${id}/lists`, { name: newListName });
      setLists([...lists, newList]);
      setNewListName('');
      setShowAddList(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Delete List Column
  const handleDeleteList = async (listId) => {
    if (!window.confirm('Are you sure you want to delete this list and all its cards?')) return;
    try {
      await api.delete(`/lists/${listId}`);
      setLists(lists.filter(l => l.id !== listId));
    } catch (err) {
      console.error(err);
    }
  };

  // Milestones Handlers
  const handleAddMilestone = async (e) => {
    e.preventDefault();
    if (!newMilestoneTitle.trim()) return;
    try {
      const newMilestone = await api.post(`/projects/${id}/milestones`, {
        title: newMilestoneTitle,
        due_date: newMilestoneDate || null
      });
      setMilestones([...milestones, newMilestone]);
      setNewMilestoneTitle('');
      setNewMilestoneDate('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMilestone = async (milestoneId) => {
    if (!window.confirm('Delete this milestone?')) return;
    try {
      await api.delete(`/projects/${id}/milestones/${milestoneId}`);
      setMilestones(milestones.filter(m => m.id !== milestoneId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteProject = async () => {
    if (!window.confirm(`Are you sure you want to permanently delete "${project?.name}" and all its data? This cannot be undone.`)) return;
    try {
      await api.delete(`/projects/${id}`);
      navigate('/');
    } catch (err) {
      alert(err.message || 'Failed to delete project');
    }
  };

  const handleExportPDF = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;

      const doc = new jsPDF();
      
      // Title
      doc.setFontSize(20);
      doc.text(`Project: ${project.name}`, 14, 22);
      
      // Subtitle
      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
      doc.text(`Total Members: ${members.length}`, 14, 36);

      // Tasks Table
      const tableColumn = ["Task Title", "Priority", "Status / Column", "Due Date", "Assignees"];
      const tableRows = [];

      lists.forEach(list => {
        list.tasks.forEach(task => {
          const assigneesStr = task.assignees && task.assignees.length > 0 
            ? task.assignees.map(a => a.username).join(', ') 
            : 'Unassigned';
          
          const dueDateStr = task.due_date ? new Date(task.due_date).toLocaleDateString() : 'None';
          
          const taskData = [
            task.title,
            task.priority.toUpperCase(),
            list.name,
            dueDateStr,
            assigneesStr
          ];
          
          tableRows.push(taskData);
        });
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 45,
        theme: 'grid',
        styles: { fontSize: 10 },
        headStyles: { fillColor: [99, 102, 241] }
      });

      doc.save(`${project.name}_Report.pdf`);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      alert('Failed to generate PDF. Make sure dependencies are installed.');
    }
  };

  // Add Card Task
  const handleAddTask = async (e, listId) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    try {
      const newTask = await api.post(`/lists/${listId}/tasks`, { title: newTaskTitle });
      
      setLists(lists.map(l => {
        if (l.id === listId) {
          return { ...l, tasks: [...l.tasks, newTask] };
        }
        return l;
      }));

      setNewTaskTitle('');
      setActiveAddCardListId(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Invite Member
  const handleInviteMember = async (e) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    setInviteLoading(true);

    try {
      await api.post(`/projects/${id}/members`, { email: inviteEmail, role: inviteRole });
      setInviteSuccess('Member added successfully!');
      setInviteEmail('');
      setInviteRole('member');
      fetchBoardData(); // reload members list
    } catch (err) {
      setInviteError(err.message || 'Failed to add member');
    } finally {
      setInviteLoading(false);
    }
  };

  // Filtering logic
  const filteredLists = lists.map(list => {
    return {
      ...list,
      tasks: list.tasks.filter(task => {
        // Search Filter
        const matchesSearch = !searchQuery || 
          task.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
          (task.description && task.description.toLowerCase().includes(searchQuery.toLowerCase()));
        
        // Priority Filter
        const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;
        
        // Assignee Filter
        const matchesAssignee = filterAssignee === 'all' || 
          (filterAssignee === 'unassigned' && (!task.assignees || task.assignees.length === 0)) ||
          (task.assignees && task.assignees.some(a => a.id === parseInt(filterAssignee)));

        // Due Date Filter
        let matchesDueDate = true;
        if (filterDueDate !== 'all') {
          if (!task.due_date) {
            matchesDueDate = false;
          } else {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dueDate = new Date(task.due_date);
            dueDate.setHours(0, 0, 0, 0);
            
            const diffTime = dueDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (filterDueDate === 'overdue') {
              matchesDueDate = diffDays < 0;
            } else if (filterDueDate === 'today') {
              matchesDueDate = diffDays === 0;
            } else if (filterDueDate === 'tomorrow') {
              matchesDueDate = diffDays === 1;
            } else if (filterDueDate === 'upcoming') {
              matchesDueDate = diffDays > 0 && diffDays <= 7;
            }
          }
        }

        return matchesSearch && matchesPriority && matchesAssignee && matchesDueDate;
      })
    };
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>Loading project board...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '20px' }}>
        <div style={{ color: 'var(--priority-high)', fontSize: '1.2rem' }}>{error}</div>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Milestones Sidebar/Modal */}
      {showMilestones && (
        <div className="modal-overlay" onClick={() => setShowMilestones(false)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 0 }}>
                <Map size={24} color="var(--primary)" /> Project Milestones
              </h2>
              <button className="modal-close-btn" onClick={() => setShowMilestones(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddMilestone} style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
              <input 
                type="text"
                placeholder="Milestone title..."
                value={newMilestoneTitle}
                onChange={(e) => setNewMilestoneTitle(e.target.value)}
                className="input-field"
                style={{ flex: 1 }}
              />
              <input 
                type="date"
                value={newMilestoneDate}
                onChange={(e) => setNewMilestoneDate(e.target.value)}
                className="input-field"
                style={{ width: '150px' }}
              />
              <button type="submit" className="btn btn-primary">Add</button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {milestones.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>No milestones created yet.</div>
              ) : (
                milestones.map(m => {
                  const percent = m.total_tasks > 0 ? Math.round((m.completed_tasks / m.total_tasks) * 100) : 0;
                  return (
                    <div key={m.id} style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{m.title}</div>
                          {m.due_date && <div style={{ fontSize: '0.8rem', color: 'var(--priority-medium)' }}>Due: {new Date(m.due_date).toLocaleDateString()}</div>}
                        </div>
                        <button onClick={() => handleDeleteMilestone(m.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                        <span>Progress ({m.completed_tasks}/{m.total_tasks} Tasks)</span>
                        <span style={{ fontWeight: 'bold' }}>{percent}%</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: 'var(--bg-input)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${percent}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.3s' }}></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Activity Feed Sidebar */}
      {showActivityFeed && (
        <ActivityFeed projectId={id} onClose={() => setShowActivityFeed(false)} />
      )}

      {/* Task Modal */}
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

          <div className="profile-pill">
            <div className="avatar">
              {user?.username ? user.username.substring(0, 2).toUpperCase() : 'U'}
            </div>
            <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{user?.username}</span>
          </div>

          <button className="btn btn-secondary" onClick={logout} style={{ padding: '8px 12px' }}>
            <LogOut size={16} />
            <span style={{ display: 'inline' }}>Logout</span>
          </button>
        </div>
      </nav>

      {/* Board Layout */}
      <div className="board-container">
        {/* Board Subheader */}
        <div className="board-header">
          <div className="board-title-area">
            <div className="board-breadcrumbs">
              <span onClick={() => navigate('/')}>Dashboard</span> / {project?.name}
            </div>
            <h2>{project?.name}</h2>
          </div>

          <div className="board-members">
            <div className="project-members-avatars" style={{ marginRight: '10px' }}>
              {members.map(m => (
                <div key={m.id} className="project-member-avatar-overlap" title={`${m.username} (${m.role || 'owner'})`} style={{ position: 'relative' }}>
                  {m.username.substring(0, 2).toUpperCase()}
                  {(!m.role || m.role === 'admin') && (
                    <div style={{ position: 'absolute', bottom: -2, right: -2, background: 'var(--primary)', borderRadius: '50%', width: '8px', height: '8px', border: '1px solid #1e293b' }} title="Admin"></div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary btn-icon" title="Activity Log" onClick={() => setShowActivityFeed(true)}>
                <Activity size={16} />
              </button>
              <button className="btn btn-secondary btn-icon" title="Export Report" onClick={handleExportPDF}>
                <Download size={16} />
              </button>
              <button className="btn btn-secondary btn-icon" title="Milestones" onClick={() => setShowMilestones(true)}>
                <Map size={16} />
              </button>
              {currentUserRole !== 'viewer' && currentUserRole !== 'member' && (
                <button className="btn btn-secondary btn-icon" title="Manage Members" onClick={() => setShowManageMembers(true)}>
                  <Users size={16} />
                </button>
              )}
              {currentUserRole !== 'viewer' && (
                <button className="btn btn-secondary" onClick={() => setShowInviteModal(true)}>
                  <UserPlus size={16} /> Invite Member
                </button>
              )}
              {currentUserRole === 'owner' && (
                <button className="btn btn-danger btn-icon" title="Delete Project" onClick={handleDeleteProject}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div style={{ display: 'flex', gap: '16px', padding: '0 32px 16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            placeholder="Search tasks..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', width: '250px' }}
          />
          <select 
            value={filterPriority} 
            onChange={(e) => setFilterPriority(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
          <select 
            value={filterAssignee} 
            onChange={(e) => setFilterAssignee(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
          >
            <option value="all">All Assignees</option>
            <option value="unassigned">Unassigned</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.username}</option>
            ))}
          </select>
          <select 
            value={filterDueDate} 
            onChange={(e) => setFilterDueDate(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
          >
            <option value="all">Any Due Date</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due Today</option>
            <option value="tomorrow">Due Tomorrow</option>
            <option value="upcoming">Due Next 7 Days</option>
          </select>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', background: 'var(--bg-card)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <button 
              className={`btn ${viewMode === 'kanban' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('kanban')}
              style={{ padding: '6px 12px' }}
            >
              <Layout size={16} /> Kanban
            </button>
            <button 
              className={`btn ${viewMode === 'calendar' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('calendar')}
              style={{ padding: '6px 12px' }}
            >
              <Calendar size={16} /> Calendar
            </button>
            <button 
              className={`btn ${viewMode === 'analytics' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('analytics')}
              style={{ padding: '6px 12px' }}
            >
              <PieChart size={16} /> Analytics
            </button>
          </div>
        </div>

        {/* View Mode Switcher */}
        {viewMode === 'analytics' && (
          <AnalyticsView lists={filteredLists} members={members} />
        )}

        {viewMode === 'calendar' && (
          <CalendarView 
            lists={filteredLists} 
            onTaskClick={setSelectedTaskId} 
            onTaskDateChange={handleTaskDateChange}
          />
        )}

        {viewMode === 'kanban' && (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="all-lists" direction="horizontal" type="list">
            {(provided) => (
              <div 
                className="board-canvas"
                {...provided.droppableProps}
                ref={provided.innerRef}
              >
                {filteredLists.map((list, index) => (
                  <Draggable draggableId={`list-${list.id}`} index={index} key={list.id}>
                    {(provided) => (
                      <div 
                        className="board-list"
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                      >
                        {/* List Header */}
                        <div className="board-list-header" {...provided.dragHandleProps}>
                          <div className="board-list-title">
                            {list.name}
                            <span className="board-list-count">{list.tasks.length}</span>
                          </div>
                          <button 
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                            onClick={() => handleDeleteList(list.id)}
                            title="Delete Column"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>

                        {/* List Tasks Area */}
                        <Droppable droppableId={`list-${list.id}`} type="task">
                          {(provided) => (
                            <div 
                              className="board-list-cards"
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                            >
                              {list.tasks.map((task, idx) => (
                                <Draggable draggableId={`task-${task.id}`} index={idx} key={task.id}>
                                  {(provided) => (
                                    <div 
                                      className="task-card"
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      onClick={() => setSelectedTaskId(task.id)}
                                    >
                                      <div className="task-card-header">
                                        <span className="task-card-title">{task.title}</span>
                                      </div>
                                      
                                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        <span className={`priority-badge ${task.priority}`}>
                                          {task.priority}
                                        </span>
                                      </div>

                                      {/* Card Badges */}
                                      <div className="task-card-meta">
                                        <div className="task-meta-icons">
                                          {task.comment_count > 0 && (
                                            <div className="task-meta-item">
                                              <MessageSquare size={13} />
                                              <span>{task.comment_count}</span>
                                            </div>
                                          )}
                                          {task.checklist_summary && task.checklist_summary.total > 0 && (
                                            <div className="task-meta-item" style={{ color: task.checklist_summary.completed === task.checklist_summary.total ? 'var(--priority-low)' : 'var(--text-secondary)' }}>
                                              <CheckIcon size={13} />
                                              <span>{task.checklist_summary.completed}/{task.checklist_summary.total}</span>
                                            </div>
                                          )}
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          {task.due_date && (() => {
                                            // Parse YYYY-MM-DD as local date (not UTC)
                                            const [y, m, d] = task.due_date.split('-').map(Number);
                                            const dueLocal = new Date(y, m - 1, d);
                                            const today = new Date(); today.setHours(0,0,0,0);
                                            const isOverdue = dueLocal < today;
                                            return (
                                              <div className={`due-date-badge ${isOverdue ? 'overdue' : 'upcoming'}`}>
                                                <Calendar size={11} />
                                                <span>{dueLocal.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</span>
                                              </div>
                                            );
                                          })()}
                                          
                                          {task.assignees && task.assignees.length > 0 && (
                                            <div style={{ display: 'flex' }}>
                                              {task.assignees.map(assignee => (
                                                <div 
                                                  key={assignee.id}
                                                  className="avatar" 
                                                  style={{ width: '20px', height: '20px', fontSize: '0.65rem', marginLeft: '-4px', border: '1px solid var(--bg-card)' }}
                                                  title={`Assigned to: ${assignee.username}`}
                                                >
                                                  {assignee.username.substring(0, 2).toUpperCase()}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>

                        {/* Add Card Component */}
                        {/* List Footer */}
                        {currentUserRole !== 'viewer' && (
                          <div className="list-footer" style={{ marginTop: 'auto', paddingTop: '10px' }}>
                            {activeAddCardListId === list.id ? (
                              <form onSubmit={(e) => handleAddTask(e, list.id)}>
                                <input 
                                  type="text" 
                                  className="input-field" 
                                  placeholder="Task title..."
                                  value={newTaskTitle}
                                  onChange={(e) => setNewTaskTitle(e.target.value)}
                                  autoFocus
                                />
                                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                  <button type="submit" className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Add</button>
                                  <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => { setActiveAddCardListId(null); setNewTaskTitle(''); }}>Cancel</button>
                                </div>
                              </form>
                            ) : (
                              <button className="add-card-btn" onClick={() => setActiveAddCardListId(list.id)}>
                                <Plus size={16} /> Add a card
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}

                {/* Add Column/List */}
                <div className="add-list-container">
                {currentUserRole !== 'viewer' && (
                  showAddList ? (
                    <div className="add-list-column glass-panel">
                      <form onSubmit={handleAddList} className="add-list-input-area">
                        <input 
                          type="text" 
                          className="input-field" 
                          placeholder="Column title..."
                          value={newListName}
                          onChange={(e) => setNewListName(e.target.value)}
                          autoFocus
                          required
                        />
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button type="submit" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                            Add Column
                          </button>
                          <button 
                            type="button" 
                            className="btn btn-secondary" 
                            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                            onClick={() => {
                              setShowAddList(false);
                              setNewListName('');
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <button className="btn btn-secondary add-list-column" onClick={() => setShowAddList(true)} style={{ height: 'auto', display: 'flex', gap: '8px', cursor: 'pointer' }}>
                      <Plus size={16} /> Add Column
                    </button>
                  )
                )}
                </div>
              </div>
            )}
          </Droppable>
        </DragDropContext>
        )}
      </div>

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowInviteModal(false)}>
              <X size={20} />
            </button>
            <h2 className="modal-title">Invite Member</h2>
            {inviteError && (
              <div style={{ color: 'var(--priority-high)', marginBottom: '16px', fontSize: '0.9rem' }}>{inviteError}</div>
            )}
            {inviteSuccess && (
              <div style={{ color: 'var(--priority-low)', marginBottom: '16px', fontSize: '0.9rem' }}>{inviteSuccess}</div>
            )}
            <form onSubmit={handleInviteMember}>
              <div className="form-group">
                <label htmlFor="invEmail">Email Address</label>
                <input
                  id="invEmail"
                  type="email"
                  className="input-field"
                  placeholder="collaborator@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="invRole">Role</label>
                <select
                  id="invRole"
                  className="input-field"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowInviteModal(false)}>
                  Done
                </button>
                <button type="submit" className="btn btn-primary" disabled={inviteLoading}>
                  {inviteLoading ? 'Inviting...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Members Modal */}
      {showManageMembers && (
        <ManageMembersModal
          project={project}
          members={members}
          currentUser={user}
          onClose={() => setShowManageMembers(false)}
          fetchBoardData={fetchBoardData}
        />
      )}

      {/* Card Details Modal Overlay */}
      {selectedTaskId && (
        <TaskModal 
          taskId={selectedTaskId}
          projectMembers={members}
          milestones={milestones}
          currentUserRole={currentUserRole}
          onClose={() => {
            setSelectedTaskId(null);
            fetchBoardData(); // refresh metrics on cards
          }}
        />
      )}
    </div>
  );
}
