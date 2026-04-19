import React, { useMemo } from 'react';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function HabitCalendar({ calendar = [], color = '#f97316', compact = false }) {
  // Group days into weeks (columns of 7)
  const weeks = useMemo(() => {
    const result = [];
    let week = [];
    for (let i = 0; i < calendar.length; i++) {
      week.push(calendar[i]);
      if (week.length === 7) {
        result.push(week);
        week = [];
      }
    }
    if (week.length > 0) result.push(week);
    return result;
  }, [calendar]);

  // Month labels: find first day of each month
  const monthLabels = useMemo(() => {
    const labels = [];
    let lastMonth = null;
    weeks.forEach((week, wi) => {
      week.forEach(day => {
        if (day.date) {
          const month = day.date.slice(5, 7);
          if (month !== lastMonth) {
            labels.push({ weekIndex: wi, label: MONTHS[parseInt(month) - 1] });
            lastMonth = month;
          }
        }
      });
    });
    return labels;
  }, [weeks]);

  if (compact) {
    // Compact: last 12 weeks
    const lastWeeks = weeks.slice(-12);
    return (
      <div className="flex gap-4" style={{ gap: 3 }}>
        {lastWeeks.map((week, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {week.map((day, di) => (
              <div
                key={di}
                className="calendar-day"
                style={{ background: day.logged ? color : undefined }}
                title={day.date}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="habit-calendar">
      {/* Month labels */}
      <div style={{ display: 'flex', gap: 3, position: 'relative', height: 16, marginBottom: 4 }}>
        {monthLabels.map((m, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: m.weekIndex * 15,
              fontSize: 10,
              color: 'var(--text-dim)',
              whiteSpace: 'nowrap',
            }}
          >
            {m.label}
          </span>
        ))}
      </div>
      <div className="calendar-weeks">
        {weeks.map((week, wi) => (
          <div key={wi} className="calendar-week">
            {week.map((day, di) => (
              <div
                key={di}
                className={`calendar-day ${day.logged ? 'logged' : ''}`}
                style={{ background: day.logged ? color : undefined }}
                title={day.date ? `${day.date}${day.logged ? ' ✓' : ''}` : ''}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
