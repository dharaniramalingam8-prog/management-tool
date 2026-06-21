import React, { useMemo } from 'react';
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { Activity, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

const COLORS = ['#6366f1', '#a855f7', '#f97316', '#22c55e', '#ef4444'];

export default function AnalyticsView({ lists, members }) {
  
  // Calculate Stats
  const stats = useMemo(() => {
    let totalTasks = 0;
    let completedTasks = 0;
    
    // Using the last list as the "completed" column
    const lastListId = lists.length > 0 ? lists[lists.length - 1].id : null;
    
    const priorityCount = { high: 0, medium: 0, low: 0 };
    const assigneeCount = {};

    members.forEach(m => assigneeCount[m.id] = { name: m.username, count: 0 });

    lists.forEach(list => {
      totalTasks += list.tasks.length;
      if (list.id === lastListId) {
        completedTasks += list.tasks.length;
      }

      list.tasks.forEach(task => {
        if (task.priority === 'high') priorityCount.high++;
        else if (task.priority === 'medium') priorityCount.medium++;
        else priorityCount.low++;

        if (task.assignees && task.assignees.length > 0) {
          task.assignees.forEach(a => {
            if (assigneeCount[a.id]) {
              assigneeCount[a.id].count++;
            }
          });
        }
      });
    });

    return {
      totalTasks,
      completedTasks,
      pendingTasks: totalTasks - completedTasks,
      productivity: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      priorityData: [
        { name: 'High', value: priorityCount.high },
        { name: 'Medium', value: priorityCount.medium },
        { name: 'Low', value: priorityCount.low }
      ].filter(d => d.value > 0),
      assigneeData: Object.values(assigneeCount).filter(d => d.count > 0)
    };
  }, [lists, members]);

  return (
    <div style={{ padding: '20px 32px' }}>
      {/* Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '8px', color: 'var(--primary)' }}>
            <Activity size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Total Tasks</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{stats.totalTasks}</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '8px', color: '#22c55e' }}>
            <CheckCircle size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Completed</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{stats.completedTasks}</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'rgba(249, 115, 22, 0.1)', borderRadius: '8px', color: '#f97316' }}>
            <Clock size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Pending</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{stats.pendingTasks}</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'rgba(168, 85, 247, 0.1)', borderRadius: '8px', color: 'var(--secondary)' }}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Productivity</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{stats.productivity}%</div>
          </div>
        </div>

      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
        
        {/* Priority Pie Chart */}
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '1.2rem', fontWeight: '600' }}>Tasks by Priority</h3>
          <div style={{ height: '300px' }}>
            {stats.priorityData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.priorityData}
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {stats.priorityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>No data available</div>
            )}
          </div>
        </div>

        {/* Assignee Bar Chart */}
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '1.2rem', fontWeight: '600' }}>Tasks by Member</h3>
          <div style={{ height: '300px' }}>
            {stats.assigneeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.assigneeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--text-secondary)" />
                  <YAxis stroke="var(--text-secondary)" allowDecimals={false} />
                  <RechartsTooltip contentStyle={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                  <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>No data available</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
