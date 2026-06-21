import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { 
  X, Trash2, MessageSquare, ListTodo, Check,
  Calendar, FileText, Activity, Trash
} from 'lucide-react';

export default function TaskModal({ taskId, projectMembers, milestones = [], onClose }) {
  const socket = useSocket();
  const { user } = useAuth();

  const [task, setTask] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [comments, setComments] = useState([]);
  const [activities, setActivities] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Field Edit States
  const [editingDesc, setEditingDesc] = useState(false);
  const [descText, setDescText] = useState('');
  
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [newCommentText, setNewCommentText] = useState('');

  const [savingTitle, setSavingTitle] = useState(false);

  const fetchTaskDetails = useCallback(async () => {
    try {
      const data = await api.get(`/tasks/${taskId}/details`);
      setTask(data.task);
      setChecklist(data.checklist);
      setComments(data.comments);
      setActivities(data.activities);
      setAttachments(data.attachments || []);
      setDescText(data.task.description || '');
      setLoading(false);
    } catch (err) {
      console.error('Error fetching task details:', err);
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchTaskDetails();
  }, [fetchTaskDetails]);

  // WebSocket Live Sync for Task Details
  useEffect(() => {
    if (!socket) return;

    socket.on('comment-added', (data) => {
      if (parseInt(data.taskId) === parseInt(taskId)) {
        setComments(prev => [data.comment, ...prev]);
      }
    });

    socket.on('task-updated', (data) => {
      if (parseInt(data.taskId) === parseInt(taskId)) {
        fetchTaskDetails();
      }
    });

    socket.on('board-updated', (data) => {
      if (data.taskId && parseInt(data.taskId) === parseInt(taskId)) {
        if (data.type === 'attachment-added' || data.type === 'attachment-deleted') {
          fetchTaskDetails();
        }
      }
    });

    return () => {
      socket.off('comment-added');
      socket.off('task-updated');
      socket.off('board-updated');
    };
  }, [socket, taskId, fetchTaskDetails]);

  const handleUpdateTaskField = async (fields) => {
    try {
      setTask(prev => ({ ...prev, ...fields }));
      await api.put(`/tasks/${taskId}`, fields);
    } catch (err) {
      console.error(err);
    }
  };

  const handleTitleBlur = async (e) => {
    const newTitle = e.target.value.trim();
    if (!newTitle || newTitle === task.title) return;
    setSavingTitle(true);
    await handleUpdateTaskField({ title: newTitle });
    setSavingTitle(false);
  };

  const handleSaveDescription = async () => {
    await handleUpdateTaskField({ description: descText });
    setEditingDesc(false);
  };

  const handleAddChecklistItem = async (e) => {
    e.preventDefault();
    if (!newChecklistItem.trim()) return;

    try {
      const newItem = await api.post(`/tasks/${taskId}/checklists`, { title: newChecklistItem });
      setChecklist([...checklist, newItem]);
      setNewChecklistItem('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleChecklist = async (itemId, currentStatus) => {
    const is_completed = currentStatus ? 0 : 1;
    setChecklist(checklist.map(item => item.id === itemId ? { ...item, is_completed } : item));
    try {
      await api.put(`/checklists/${itemId}`, { is_completed });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteChecklist = async (itemId) => {
    setChecklist(checklist.filter(item => item.id !== itemId));
    try {
      await api.delete(`/checklists/${itemId}`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    try {
      const newComment = await api.post(`/tasks/${taskId}/comments`, { content: newCommentText });
      setComments([newComment, ...comments]);
      setNewCommentText('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTask = async () => {
    if (!window.confirm('Are you sure you want to permanently delete this task?')) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Create a specific axios instance or use fetch for multipart/form-data
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:5000/api/tasks/${taskId}/attachments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      if (res.ok) {
        const newAtt = await res.json();
        setAttachments([newAtt, ...attachments]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    try {
      await api.delete(`/attachments/${attachmentId}`);
      setAttachments(attachments.filter(a => a.id !== attachmentId));
    } catch (err) {
      console.error(err);
    }
  };

  // Compute checklist progress
  const totalItems = checklist.length;
  const completedItems = checklist.filter(item => item.is_completed).length;
  const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content glass-panel" style={{ maxWidth: '400px', textAlign: 'center', padding: '30px' }}>
          <div style={{ color: 'var(--text-secondary)' }}>Loading card details...</div>
        </div>
      </div>
    );
  }

  if (!task) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-panel task-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="task-modal-header">
          <div className="task-modal-title-area">
            <div className="board-breadcrumbs" style={{ marginBottom: '4px' }}>
              In Column: <span style={{ color: 'var(--primary)', fontWeight: '600' }}>{task.list_name}</span>
            </div>
            <input 
              type="text" 
              className="task-modal-title-input" 
              defaultValue={task.title}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
              placeholder="Card Title"
              title="Click to rename"
            />
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Modal Columns */}
        <div className="task-modal-body">
          {/* Left Column (Details, Checklist, Comments) */}
          <div className="task-modal-left">
            {/* Description */}
            <div>
              <div className="task-section-title">
                <FileText size={16} /> Description
              </div>
              {editingDesc ? (
                <div>
                  <textarea 
                    className="comment-input-field"
                    value={descText}
                    onChange={(e) => setDescText(e.target.value)}
                    placeholder="Add a detailed description for this task..."
                    style={{ width: '100%', minHeight: '120px', marginBottom: '10px' }}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-primary" onClick={handleSaveDescription} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                      Save
                    </button>
                    <button className="btn btn-secondary" onClick={() => { setEditingDesc(false); setDescText(task.description || ''); }} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div 
                  className="desc-text" 
                  onClick={() => setEditingDesc(true)}
                  style={{ color: task.description ? 'var(--text-primary)' : 'var(--text-muted)' }}
                >
                  {task.description || 'Add a more detailed description...'}
                </div>
              )}
            </div>

            {/* Checklist */}
            <div>
              <div className="task-section-title">
                <ListTodo size={16} /> Checklist
              </div>
              
              <div className="checklist-progress-container">
                <span style={{ fontSize: '0.85rem', fontWeight: '600', width: '32px' }}>{progressPercent}%</span>
                <div className="checklist-progress-bar">
                  <div className="checklist-progress-fill" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>

              <div className="checklist-items-list">
                {checklist.map(item => (
                  <div key={item.id} className="checklist-item">
                    <div className="checklist-item-left">
                      <div 
                        className={`checklist-checkbox ${item.is_completed ? 'checked' : ''}`}
                        onClick={() => handleToggleChecklist(item.id, item.is_completed)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {item.is_completed === 1 && <Check size={12} strokeWidth={3} />}
                      </div>
                      <span className={`checklist-item-title ${item.is_completed ? 'completed' : ''}`}>
                        {item.title}
                      </span>
                    </div>
                    <button 
                      className="btn-danger btn-icon"
                      style={{ padding: '4px', borderRadius: '4px', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
                      onClick={() => handleDeleteChecklist(item.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddChecklistItem} className="add-checklist-input-group">
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Add item..."
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  style={{ padding: '8px 12px', fontSize: '0.9rem' }}
                />
                <button type="submit" className="btn btn-secondary" style={{ padding: '8px 14px' }}>
                  Add
                </button>
              </form>
            </div>

            {/* Attachments */}
            <div>
              <div className="task-section-title">
                <FileText size={16} /> Attachments
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', padding: '6px 12px', fontSize: '0.85rem' }}>
                  Upload File
                  <input type="file" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>
              </div>
              {attachments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                  {attachments.map(att => (
                    <div key={att.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <a href={`http://localhost:5000${att.filepath}`} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.9rem', wordBreak: 'break-all' }}>
                        {att.filename}
                      </a>
                      <button onClick={() => handleDeleteAttachment(att.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Comments Thread */}
            <div>
              <div className="task-section-title">
                <MessageSquare size={16} /> Comments
              </div>

              <form onSubmit={handleAddComment} className="comment-input-area">
                <textarea 
                  className="comment-input-field"
                  placeholder="Write a comment..."
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  rows="2"
                  required
                />
                <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-end', height: '42px' }}>
                  Send
                </button>
              </form>

              <div className="comments-list">
                {comments.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '16px' }}>
                    No comments yet. Start the conversation!
                  </div>
                ) : (
                  comments.map(c => (
                    <div key={c.id} className="comment-card">
                      <div className="avatar" style={{ width: '32px', height: '32px', flexShrink: 0 }}>
                        {c.username.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="comment-bubble">
                        <div className="comment-header">
                          <span className="comment-author">{c.username}</span>
                          <span className="comment-time">
                            {new Date(c.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="comment-content">{c.content}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column Sidebar (Fields, Actions, Activity logs) */}
          <div className="task-modal-right">
            {/* Assignees */}
            <div className="sidebar-group">
              <label>Assignees</label>
              <div className="sidebar-select" style={{ height: 'auto', padding: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                {projectMembers.map(m => {
                  const isAssigned = task.assignees && task.assignees.some(a => a.id === m.id);
                  return (
                    <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                      <input 
                        type="checkbox" 
                        checked={isAssigned || false} 
                        onChange={(e) => {
                          const newAssignees = e.target.checked 
                            ? [...(task.assignees || []), m]
                            : (task.assignees || []).filter(a => a.id !== m.id);
                          const newIds = newAssignees.map(a => a.id);
                          handleUpdateTaskField({ assignees: newAssignees, assignee_ids: newIds });
                        }}
                      />
                      {m.username}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Milestone */}
            {milestones.length > 0 && (
              <div className="sidebar-group">
                <label>Milestone</label>
                <select 
                  className="sidebar-select"
                  value={task.milestone_id || ''}
                  onChange={(e) => handleUpdateTaskField({ milestone_id: e.target.value ? parseInt(e.target.value) : null })}
                >
                  <option value="">No Milestone</option>
                  {milestones.map(m => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Priority */}
            <div className="sidebar-group">
              <label htmlFor="prioritySelect">Priority</label>
              <select 
                id="prioritySelect"
                className="sidebar-select"
                value={task.priority}
                onChange={(e) => handleUpdateTaskField({ priority: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            {/* Due Date */}
            <div className="sidebar-group">
              <label htmlFor="dueDateSelect">Due Date</label>
              <input 
                id="dueDateSelect"
                type="date"
                className="sidebar-date"
                value={task.due_date ? task.due_date.substring(0, 10) : ''}
                onChange={(e) => handleUpdateTaskField({ due_date: e.target.value || null })}
              />
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '8px 0' }} />

            {/* Delete button */}
            <button className="btn btn-danger" onClick={handleDeleteTask} style={{ width: '100%', gap: '8px' }}>
              <Trash size={16} /> Delete Card
            </button>

            {/* Activity Logs */}
            <div>
              <div className="task-section-title" style={{ fontSize: '0.8rem', marginBottom: '16px' }}>
                <Activity size={14} /> Activity Feed
              </div>
              <div className="activities-list">
                {activities.map(act => (
                  <div key={act.id} className="activity-item" style={{ fontSize: '0.75rem' }}>
                    <div>
                      <span className="activity-user" style={{ color: 'var(--primary)' }}>{act.username}</span>{' '}
                      <span>{act.content}</span>
                      <div className="activity-time">
                        {new Date(act.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
