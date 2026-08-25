import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MiniCalendarProps {
  currentDate: string; // YYYY-MM-DD
  onDateSelect: (date: string) => void;
}

export default function MiniCalendar({ currentDate, onDateSelect }: MiniCalendarProps) {
  const [viewDate, setViewDate] = useState(new Date(currentDate));

  const currentMonth = viewDate.getMonth();
  const currentYear = viewDate.getFullYear();

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  // Adjust so Monday is 0
  const startDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const dayNames = ["P", "P", "S", "Ç", "P", "C", "C"]; // Pzt, Sal, Çar, Per, Cum, Cmt, Paz

  const changeMonth = (offset: number) => {
    const newDate = new Date(viewDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setViewDate(newDate);
  };

  const days = [];
  for (let i = 0; i < startDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ padding: '10px 0', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>
          {monthNames[currentMonth]} {currentYear}
        </h4>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => changeMonth(-1)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--foreground)' }}>
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => changeMonth(1)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--foreground)' }}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: 8 }}>
        {dayNames.map((d, i) => (
          <div key={i} style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--foreground-2)', padding: '4px 0' }}>{d}</div>
        ))}
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px 0', textAlign: 'center' }}>
        {days.map((d, i) => {
          if (!d) return <div key={i} />;
          
          const dateStr = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
          const isSelected = dateStr === currentDate;
          const isToday = dateStr === todayStr;

          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  setViewDate(new Date(currentYear, currentMonth, d));
                  onDateSelect(dateStr);
                }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                  fontWeight: isSelected ? 600 : 400,
                  cursor: 'pointer',
                  border: 'none',
                  background: isSelected ? 'var(--brand, #0d6efd)' : isToday ? 'var(--input-bg, #f3f4f6)' : 'transparent',
                  color: isSelected ? '#fff' : 'var(--foreground, #333)',
                  transition: 'all 0.2s'
                }}
              >
                {d}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
