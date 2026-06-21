import React, { useState, useEffect } from 'react';
import { X, Activity } from 'lucide-react';
import { api } from '../utils/api';
import { useSocket } from '../context/SocketContext';

export default function ActivityFeed({ projectId, onClose }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const socket = useSocket();

  const fetchActivities = async () => {
    try {
      const data = await api.get(`/projects/${projectId}/activities`);
      setActivities(data);
    } catch (err) {
      console.error('Failed to fetch activities:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, [projectId]);

  useEffect(() => {
    if (!socket) return;
    
    const handleUpdate = () => {
      fetchActivities(); // Refresh activities on any board update
    };

    socket.on('board-updated', handleUpdate);
    socket.on('comment-added', handleUpdate);

    return () => {
      socket.off('board-updated', handleUpdate);
      socket.off('comment-added', handleUpdate);
    };
  }, [socket, projectId]);

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000, justifyContent: 'flex-end', padding: 0 }}>
      <div 
        className="modal-content glass-panel" 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          margin: 0, 
          height: '100vh', 
          width: '400px', 
          maxWidth: '100%',
          borderRadius: '0',
          borderLeft: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.3s ease'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid var(--border-color)' }}>
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 0 }}>
            <Activity size={24} color="var(--primary)" /> Activity Log
          </h2>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading activities...</div>
          ) : activities.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No recent activity.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {activities.map(activity => (
                <div key={activity.id} style={{ display: 'flex', gap: '12px' }}>
                  <div className="avatar" style={{ width: '32px', height: '32px', flexShrink: 0 }}>
                    {activity.username.substring(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      <strong>{activity.username}</strong> {activity.content}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {new Date(activity.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
