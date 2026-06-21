import React, { useState } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './CalendarView.css';

const locales = {
  'en-US': enUS
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

export default function CalendarView({ lists, onTaskClick, onTaskDateChange }) {
  const [view, setView] = useState('month');
  const [date, setDate] = useState(new Date());

  // Convert tasks into calendar events
  const events = [];

  lists.forEach(list => {
    list.tasks.forEach(task => {
      if (task.due_date) {
        // Parse YYYY-MM-DD as LOCAL date, not UTC (avoids "day off by 1" timezone bug)
        const [y, m, d] = task.due_date.split('-').map(Number);
        const localDate = new Date(y, m - 1, d);
        events.push({
          id: task.id,
          title: task.title,
          start: localDate,
          end: localDate,
          allDay: true,
          task: task,
          listName: list.name
        });
      }
    });
  });

  const eventStyleGetter = (event, start, end, isSelected) => {
    let backgroundColor = 'var(--primary)';
    
    // Priority colors
    if (event.task && event.task.priority === 'high') backgroundColor = '#ef4444';
    else if (event.task && event.task.priority === 'medium') backgroundColor = '#f97316';
    else if (event.task && event.task.priority === 'low') backgroundColor = '#22c55e';

    // Overdue check - parse as local date to avoid timezone issues
    let isOverdue = false;
    if (event.task && event.task.due_date) {
      const [oy, om, od] = event.task.due_date.split('-').map(Number);
      const dueLocal = new Date(oy, om - 1, od);
      const todayLocal = new Date(); todayLocal.setHours(0, 0, 0, 0);
      isOverdue = dueLocal < todayLocal;
    }
    const listNameStr = (event.listName || '').toLowerCase();
    const isDone = listNameStr.includes('done') || listNameStr.includes('completed');

    let style = {
      backgroundColor: backgroundColor,
      borderRadius: '4px',
      opacity: 0.9,
      color: 'white',
      border: '0px',
      display: 'block',
      padding: '2px 4px',
      fontSize: '0.85rem'
    };

    if (isOverdue && !isDone) {
      style.border = '2px solid #ef4444';
      style.backgroundImage = 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.1) 10px, rgba(0,0,0,0.1) 20px)';
      style.boxShadow = '0 0 5px rgba(239, 68, 68, 0.5)';
    }
    return {
      style: style
    };
  };

  return (
    <div className="calendar-container">
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: 'calc(100vh - 200px)' }}
        onSelectEvent={(event) => onTaskClick(event.task.id)}
        eventPropGetter={eventStyleGetter}
        views={['month', 'week', 'agenda']}
        view={view}
        onView={setView}
        date={date}
        onNavigate={setDate}
      />
    </div>
  );
}
