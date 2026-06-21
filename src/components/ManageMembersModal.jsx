import React, { useState } from 'react';
import { X, Shield, ShieldAlert, UserMinus } from 'lucide-react';
import { api } from '../utils/api';

export default function ManageMembersModal({ project, members, onClose, fetchBoardData, currentUser }) {
  const [error, setError] = useState('');
  const [loadingId, setLoadingId] = useState(null);

  const isAdmin = members.find(m => m.id === currentUser.id)?.role === 'admin' || project.owner_id === currentUser.id;

  const handleChangeRole = async (userId, newRole) => {
    try {
      setLoadingId(userId);
      await api.put(`/projects/${project.id}/members/${userId}`, { role: newRole });
      fetchBoardData();
    } catch (err) {
      setError(err.message || 'Failed to change role');
    } finally {
      setLoadingId(null);
    }
  };

  const handleRemoveMember = async (userId, username) => {
    if (!window.confirm(`Are you sure you want to remove ${username} from this project?`)) return;
    try {
      setLoadingId(userId);
      await api.delete(`/projects/${project.id}/members/${userId}`);
      fetchBoardData();
    } catch (err) {
      setError(err.message || 'Failed to remove member');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-panel" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>
          <X size={20} />
        </button>
        <h2 className="modal-title">Manage Members</h2>
        
        {error && <div style={{ color: 'var(--priority-high)', marginBottom: '16px' }}>{error}</div>}

        <div className="members-list" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {members.map(member => (
            <div key={member.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-input)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="avatar" style={{ width: '40px', height: '40px', fontSize: '1.2rem' }}>
                  {member.username.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
                    {member.username} 
                    {project.owner_id === member.id && <span style={{ fontSize: '0.7rem', background: 'var(--primary-glow)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>Owner</span>}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{member.email}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {member.joined_at ? `Joined: ${new Date(member.joined_at).toLocaleDateString()}` : 'Joined: N/A'} • {member.assigned_tasks_count || 0} tasks assigned
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`priority-badge ${member.role === 'admin' ? 'high' : 'low'}`} style={{ marginRight: '8px' }}>
                  {member.role || 'member'}
                </span>

                {isAdmin && project.owner_id !== member.id && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select
                      className="input-field"
                      style={{ padding: '4px 8px', width: 'auto', fontSize: '0.8rem' }}
                      value={member.role || 'member'}
                      disabled={loadingId === member.id}
                      onChange={(e) => handleChangeRole(member.id, e.target.value)}
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button 
                      className="btn btn-secondary btn-icon" 
                      disabled={loadingId === member.id}
                      style={{ color: 'var(--priority-high)' }}
                      onClick={() => handleRemoveMember(member.id, member.username)}
                      title="Remove Member"
                    >
                      <UserMinus size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
