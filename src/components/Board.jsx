import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { 
  Plus, Users, X, CheckSquare, LogOut, ArrowLeft, Trash2, 
  MessageSquare, CheckSquare as CheckIcon, Calendar, UserPlus, Bell
} from 'lucide-react';
import TaskModal from './TaskModal';

export default function Board() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const socket = useSocket();

  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Selected task for modal
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  // Invite Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  // New Column/List State
  const [showAddList, setShowAddList] = useState(false);
  const [newListName, setNewListName] = useState('');

  // Inline New Card State (key is listId, value is cardTitle)
  const [activeAddCardListId, setActiveAddCardListId] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // Notifications bell (just like dashboard)
  const [notifications, setNotifications] = useState([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  const fetchBoardData = useCallback(async () => {
    try {
      const data = await api.get(`/projects/${id}`);
      setProject(data.project);
      setMembers(data.members);
      setLists(data.lists);
      setLoading(false);
    } catch (err) {
      setError(err.message || 'Access denied or project not found');
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

    return () => {
      socket.emit('leave-project', id);
      socket.off('board-updated');
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
      await api.post(`/projects/${id}/members`, { email: inviteEmail });
      setInviteSuccess('Member added successfully!');
      setInviteEmail('');
      fetchBoardData(); // reload members list
    } catch (err) {
      setInviteError(err.message || 'Failed to add member');
    } finally {
      setInviteLoading(false);
    }
  };

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
                <div key={m.id} className="project-member-avatar-overlap" title={`${m.username} (${m.email})`}>
                  {m.username.substring(0, 2).toUpperCase()}
                </div>
              ))}
            </div>
            <button className="btn btn-secondary" onClick={() => setShowInviteModal(true)}>
              <UserPlus size={16} /> Invite Member
            </button>
          </div>
        </div>

        {/* Kanban Canvas */}
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="all-lists" direction="horizontal" type="list">
            {(provided) => (
              <div 
                className="board-canvas"
                {...provided.droppableProps}
                ref={provided.innerRef}
              >
                {lists.map((list, index) => (
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
                                          {task.due_date && (
                                            <div className={`due-date-badge ${new Date(task.due_date) < new Date() ? 'overdue' : 'upcoming'}`}>
                                              <Calendar size={11} />
                                              <span>{new Date(task.due_date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</span>
                                            </div>
                                          )}
                                          
                                          {task.assignee_name && (
                                            <div 
                                              className="avatar" 
                                              style={{ width: '20px', height: '20px', fontSize: '0.65rem' }}
                                              title={`Assigned to: ${task.assignee_name}`}
                                            >
                                              {task.assignee_name.substring(0, 2).toUpperCase()}
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
                        {activeAddCardListId === list.id ? (
                          <form onSubmit={(e) => handleAddTask(e, list.id)} style={{ marginTop: '10px' }}>
                            <input 
                              type="text" 
                              className="input-field" 
                              placeholder="Enter card title..."
                              value={newTaskTitle}
                              onChange={(e) => setNewTaskTitle(e.target.value)}
                              autoFocus
                              required
                            />
                            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                              <button type="submit" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                                Add Card
                              </button>
                              <button 
                                type="button" 
                                className="btn btn-secondary" 
                                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                onClick={() => {
                                  setActiveAddCardListId(null);
                                  setNewTaskTitle('');
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : (
                          <button 
                            className="add-card-btn"
                            onClick={() => {
                              setActiveAddCardListId(list.id);
                              setNewTaskTitle('');
                            }}
                          >
                            <Plus size={14} /> Add Card
                          </button>
                        )}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}

                {/* Add Column/List */}
                {showAddList ? (
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
                )}
              </div>
            )}
          </Droppable>
        </DragDropContext>
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

      {/* Card Details Modal Overlay */}
      {selectedTaskId && (
        <TaskModal 
          taskId={selectedTaskId}
          projectMembers={members}
          onClose={() => {
            setSelectedTaskId(null);
            fetchBoardData(); // refresh metrics on cards
          }}
        />
      )}
    </div>
  );
}
