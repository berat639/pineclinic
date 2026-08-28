import React, { useState, useMemo, useEffect } from 'react';
import { DayPicker, Day } from 'react-day-picker';
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
  
  // Sync the displayed month if currentDate changes from outside (e.g. clicking "Bugün" or changing main calendar view)
  useEffect(() => {
    setMonth(new Date(currentDate));
  }, [currentDate]);
  
  const hd = useMemo(() => new Holidays('TR'), []);
  
  // Get all holidays for the current and next year to avoid month-edge issues
  const allHolidays = useMemo(() => {
    const y = new Date(currentDate).getFullYear();
    const h1 = hd.getHolidays(y) || [];
    const h2 = hd.getHolidays(y + 1) || [];
    const h3 = hd.getHolidays(y - 1) || [];
    return [...h3, ...h1, ...h2];
  }, [currentDate, hd]);

  const selected = new Date(currentDate);

  const modifiers = {
    holiday: (date: Date) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      
      const isHol = allHolidays.some(h => h.date.startsWith(dateStr));
      if (isHol) return true;
      
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
        .admin-content .custom-tooltip-container .custom-tooltip,
        .custom-tooltip-container .custom-tooltip {
          visibility: hidden;
          opacity: 0;
          transition: opacity 0.1s;
          background-color: var(--foreground) !important;
          color: var(--background) !important;
          text-align: center;
          border-radius: 6px;
          padding: 6px 10px;
          position: absolute;
          z-index: 10000;
          bottom: 110%;
          left: 50%;
          transform: translateX(-50%);
          white-space: nowrap;
          font-size: 0.75rem;
          font-weight: 500;
          pointer-events: none;
          box-shadow: 0 4px 10px rgba(0,0,0,0.15);
        }
        .custom-tooltip-container:hover .custom-tooltip {
          visibility: visible;
          opacity: 1;
        }
        .custom-tooltip::after {
          content: "";
          position: absolute;
          top: 100%;
          left: 50%;
          margin-left: -5px;
          border-width: 5px;
          border-style: solid;
          border-color: var(--foreground) transparent transparent transparent !important;
        }
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
        components={{
          Day: (props) => {
            const dateStr = format(props.date, 'yyyy-MM-dd');
            let title = '';
            
            const hol = allHolidays.find(h => h.date.startsWith(dateStr));
            if (hol) {
              title = hol.name;
            } else {
              const ch = customHolidays.find(c => c.date === dateStr);
              if (ch) title = ch.name;
            }
            return (
              <div className="custom-tooltip-container" style={{ position: 'relative', display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                <Day {...props} />
                {title && (
                  <div className="custom-tooltip">
                    {title}
                  </div>
                )}
              </div>
            );
          }
        }}
        showOutsideDays
      />
    </div>
  );
}
