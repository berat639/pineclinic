import React, { useState, useMemo } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { tr } from 'date-fns/locale';
import Holidays from 'date-holidays';
import { format } from 'date-fns';

interface MiniCalendarProps {
  currentDate: string; // YYYY-MM-DD
  onDateSelect: (date: string) => void;
  customHolidays?: { date: string, name: string }[];
}

export default function MiniCalendar({ currentDate, onDateSelect, customHolidays = [] }: MiniCalendarProps) {
  const [month, setMonth] = useState<Date>(new Date(currentDate));
  
  const hd = useMemo(() => new Holidays('TR'), []);
  const selected = new Date(currentDate);

  const modifiers = {
    holiday: (date: Date) => {
      const h = hd.isHoliday(date);
      if (h && h.length > 0) return true;
      
      const dateStr = format(date, 'yyyy-MM-dd');
      if (customHolidays.some(ch => ch.date === dateStr)) return true;
      
      return false;
    }
  };

  const modifiersStyles = {
    holiday: {
      color: '#e11d48',
      fontWeight: 'bold',
      backgroundColor: 'rgba(225, 29, 72, 0.1)'
    }
  };

  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
      <style>{`
        .rdp {
          --rdp-cell-size: 36px;
          --rdp-accent-color: var(--brand, #3b82f6);
          --rdp-background-color: var(--brand, #3b82f6);
          margin: 0;
        }
        .rdp-day_selected, .rdp-day_selected:focus-visible, .rdp-day_selected:hover {
          color: white !important;
          background-color: var(--brand, #3b82f6) !important;
        }
        .rdp-button:hover:not([disabled]):not(.rdp-day_selected) {
          background-color: var(--input-bg, #f3f4f6);
        }
        .rdp-caption_label {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--foreground);
        }
        .rdp-head_cell {
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--foreground-2);
          text-transform: capitalize;
        }
        .rdp-day {
          font-size: 0.85rem;
          color: var(--foreground);
        }
      `}</style>
      <DayPicker
        mode="single"
        locale={tr}
        selected={selected}
        onSelect={(date) => {
          if (date) {
            onDateSelect(format(date, 'yyyy-MM-dd'));
          }
        }}
        month={month}
        onMonthChange={setMonth}
        modifiers={modifiers}
        modifiersStyles={modifiersStyles}
        showOutsideDays
      />
    </div>
  );
}
