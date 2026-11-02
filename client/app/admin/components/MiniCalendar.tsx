import React, { useState, useMemo, useEffect } from 'react';
import { DayPicker, Day } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { tr } from 'date-fns/locale';
import Holidays from 'date-holidays';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface MiniCalendarProps {
  currentDate: string; // YYYY-MM-DD
  onDateSelect: (date: string) => void;
  onStepDate?: (offset: number) => void;
  onToday?: () => void;
  navigationCopy?: {
    previous: string;
    next: string;
    current: string;
  };
  customHolidays?: { date: string; name: string }[];
  doctorLeaves?: {
    id?: string;
    doctorId: string;
    doctorName?: string;
    date: string;
    startTime: string;
    endTime: string;
    isFullDay: boolean;
    reason?: string | null;
    substituteDoctorId?: string | null;
    substituteDoctorName?: string | null;
  }[];
  selectedDoctorIds?: string[];
}

const MONTHS_SHORT_TR = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
];

const MONTHS_FULL_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

export default function MiniCalendar({
  currentDate,
  onDateSelect,
  onStepDate,
  onToday,
  navigationCopy,
  customHolidays = [],
  doctorLeaves = [],
  selectedDoctorIds,
}: MiniCalendarProps) {
  const parseSafeDate = (dateStr: string) => {
    const d = new Date(`${dateStr.slice(0, 10)}T12:00:00`);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  };

  const [month, setMonth] = useState<Date>(() => parseSafeDate(currentDate));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(() => parseSafeDate(currentDate).getFullYear());

  // Sync the displayed month if currentDate changes from outside
  useEffect(() => {
    const next = parseSafeDate(currentDate);
    setMonth(next);
    setPickerYear(next.getFullYear());
  }, [currentDate]);

  const hd = useMemo(() => new Holidays('TR'), []);

  // Calculate exact days for each holiday to avoid timezone/duration overlaps
  const holidayMap = useMemo(() => {
    const y = month.getFullYear();
    const h1 = hd.getHolidays(y) || [];
    const h2 = hd.getHolidays(y + 1) || [];
    const h3 = hd.getHolidays(y - 1) || [];

    const map = new Map<string, string>();
    [...h3, ...h1, ...h2].forEach((h) => {
      const baseDate = h.date.substring(0, 10);
      let days = 1;
      if (h.name.includes('Ramazan')) days = 3;
      if (h.name.includes('Kurban')) days = 4;

      for (let i = 0; i < days; i++) {
        const d = new Date(baseDate + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + i);
        const dStr = d.toISOString().substring(0, 10);
        if (map.has(dStr) && !map.get(dStr)?.includes(h.name)) {
          map.set(dStr, map.get(dStr) + ' & ' + h.name);
        } else {
          map.set(dStr, h.name);
        }
      }
    });
    return map;
  }, [month, hd]);

  const leavesByDateMap = useMemo(() => {
    const map = new Map<
      string,
      NonNullable<MiniCalendarProps['doctorLeaves']>
    >();
    const hasFilter = Array.isArray(selectedDoctorIds) && selectedDoctorIds.length > 0;
    for (const leave of doctorLeaves) {
      if (!leave?.date) continue;
      if (hasFilter && !selectedDoctorIds.includes(leave.doctorId)) continue;
      const dKey = leave.date.slice(0, 10);
      const list = map.get(dKey) || [];
      list.push(leave);
      map.set(dKey, list);
    }
    return map;
  }, [doctorLeaves, selectedDoctorIds]);

  const selected = parseSafeDate(currentDate);
  const todayStr = new Date().toISOString().slice(0, 10);
  const isTodaySelected = currentDate.slice(0, 10) === todayStr;

  const stepDay = (offset: number) => {
    if (onStepDate) {
      onStepDate(offset);
      return;
    }
    const d = parseSafeDate(currentDate);
    d.setDate(d.getDate() + offset);
    onDateSelect(format(d, 'yyyy-MM-dd'));
  };

  const stepMonth = (offset: number) => {
    const d = new Date(month.getFullYear(), month.getMonth() + offset, 1, 12, 0, 0);
    setMonth(d);
    setPickerYear(d.getFullYear());
    const cur = parseSafeDate(currentDate);
    const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const nextDate = new Date(d.getFullYear(), d.getMonth(), Math.min(cur.getDate(), maxDay), 12, 0, 0);
    onDateSelect(format(nextDate, 'yyyy-MM-dd'));
  };

  const selectMonthYear = (targetMonthIdx: number, targetYear: number) => {
    const cur = parseSafeDate(currentDate);
    const maxDay = new Date(targetYear, targetMonthIdx + 1, 0).getDate();
    const nextDate = new Date(targetYear, targetMonthIdx, Math.min(cur.getDate(), maxDay), 12, 0, 0);
    setMonth(nextDate);
    onDateSelect(format(nextDate, 'yyyy-MM-dd'));
    setPickerOpen(false);
  };

  const handleTodayClick = () => {
    setPickerOpen(false);
    if (onToday) {
      onToday();
    } else {
      onDateSelect(todayStr);
    }
  };

  const modifiers = {
    holiday: (date: Date) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      if (holidayMap.has(dateStr)) return true;
      if (customHolidays.some((ch) => ch.date === dateStr)) return true;
      return false;
    },
  };

  const modifiersStyles = {
    holiday: {
      color: '#d97706',
      fontWeight: 800,
      backgroundColor: 'rgba(245, 158, 11, 0.14)',
    },
  };

  const capsuleArrowStyle: React.CSSProperties = {
    width: 24,
    height: '100%',
    padding: 0,
    border: 'none',
    background: 'transparent',
    color: 'var(--foreground-2, #475569)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.12s ease, color 0.12s ease',
  };

  return (
    <div
      style={{
        width: '100%',
        background: 'var(--card-bg, #ffffff)',
        border: '1px solid var(--input-border, #cbd5e1)',
        borderRadius: 12,
        padding: '10px 8px 8px',
        boxShadow: 'var(--pc-neo-subcard)',
        boxSizing: 'border-box',
      }}
    >
      <style>{`
        .admin-content .custom-tooltip-container .custom-tooltip,
        .custom-tooltip-container .custom-tooltip {
          visibility: hidden;
          opacity: 0;
          transition: opacity 0.1s;
          background-color: var(--card-bg, #0f172a) !important;
          color: var(--foreground, #ffffff) !important;
          border: 1px solid var(--input-border, #334155);
          text-align: center;
          border-radius: 7px;
          padding: 5px 9px;
          position: absolute;
          z-index: 60;
          bottom: 112%;
          left: 50%;
          transform: translateX(-50%);
          white-space: nowrap;
          font-size: 0.72rem;
          font-weight: 700;
          pointer-events: none;
          box-shadow: var(--pc-modal-shadow);
        }
        .custom-tooltip-container:hover .custom-tooltip {
          visibility: visible;
          opacity: 1;
        }
        .mini-cal-wrap .rdp {
          --rdp-cell-size: 32px;
          --rdp-accent-color: #2563eb;
          --rdp-background-color: var(--card-inner, #eff6ff);
          margin: 0;
          width: 100%;
        }
        .mini-cal-wrap .rdp-months,
        .mini-cal-wrap .rdp-month,
        .mini-cal-wrap .rdp-table {
          width: 100% !important;
          max-width: 100% !important;
          table-layout: fixed !important;
        }
        .mini-cal-wrap .rdp-caption {
          display: none !important;
        }
        .mini-cal-wrap .rdp-head_cell {
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--foreground-3, #64748b);
          text-transform: capitalize;
          user-select: none;
          padding-bottom: 4px;
        }
        .mini-cal-wrap .rdp-cell {
          padding: 1px;
          text-align: center;
        }
        .mini-cal-wrap .rdp-day {
          width: 31px;
          height: 31px;
          font-size: 0.79rem;
          font-weight: 600;
          color: var(--foreground, #0f172a);
          border-radius: 8px !important;
          border: 1px solid transparent !important;
          background: transparent;
          user-select: none;
          transition: all 0.12s ease;
          margin: 0 auto;
        }
        .mini-cal-wrap .rdp-day_outside {
          color: var(--foreground-3, #94a3b8) !important;
          opacity: 0.45;
        }
        .mini-cal-wrap .rdp-button:hover:not([disabled]):not(.rdp-day_selected) {
          background: var(--card-inner, #eff6ff) !important;
          border-color: var(--input-border, #93c5fd) !important;
          box-shadow: var(--pc-clay-btn) !important;
          color: var(--accent, #0284c7) !important;
        }
        /* Today (When Not Selected) — Claymorphic Clinical Ice Blue */
        .mini-cal-wrap .rdp-day_today:not(.rdp-day_selected) {
          background: var(--badge-clinic-bg, #e0f2fe) !important;
          border: 1.5px solid var(--accent, #0284c7) !important;
          color: var(--badge-clinic-text, #0369a1) !important;
          font-weight: 800 !important;
          box-shadow: var(--pc-clay-pale) !important;
        }
        /* Selected Day — Deep Clinical Blue Claymorphism */
        .mini-cal-wrap .rdp-day_selected,
        .mini-cal-wrap .rdp-day_selected:focus-visible,
        .mini-cal-wrap .rdp-day_selected:hover {
          background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%) !important;
          border: 1px solid #1d4ed8 !important;
          color: #ffffff !important;
          font-weight: 800 !important;
          box-shadow: var(--pc-clay-primary) !important;
        }
        .mini-cal-wrap .rdp-day_selected * {
          color: #ffffff !important;
        }
        .mini-cal-seg-arrow:hover {
          background: var(--card-inner, #eff6ff) !important;
          color: var(--accent, #0284c7) !important;
        }
        .mini-cal-seg-center:hover {
          color: var(--accent, #0284c7) !important;
        }
      `}</style>

      {/* Ferah İki Kapsüllü Tek Satır Gezinme: [ ‹ Kasım 2026 › ]  [ ‹ Bugün › ] */}
      <div
        aria-label={`${navigationCopy?.current || 'Günlük görünüm'} tarih gezinmesi`}
        style={{
          display: 'grid',
          gridTemplateColumns: '1.36fr 1fr',
          gap: 6,
          marginBottom: 9,
        }}
      >
        {/* 1. Kapsül: Ay Gezinmesi & Tıklanabilir Ay/Yıl Seçici */}
        <div
          style={{
            height: 32,
            borderRadius: 9,
            border: pickerOpen
              ? '1px solid #1d4ed8'
              : '1px solid var(--input-border, #cbd5e1)',
            background: 'var(--card-bg, #ffffff)',
            boxShadow: 'var(--pc-clay-btn)',
            display: 'grid',
            gridTemplateColumns: '22px minmax(0, 1fr) 22px',
            alignItems: 'center',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            className="mini-cal-seg-arrow"
            onClick={() => stepMonth(-1)}
            aria-label="Önceki ay"
            title="Önceki Ay"
            style={{
              ...capsuleArrowStyle,
              width: 22,
              borderRight: '1px solid var(--input-border, #e2e8f0)',
            }}
          >
            <ChevronLeft size={14} strokeWidth={2.4} />
          </button>

          <button
            type="button"
            className="mini-cal-seg-center"
            onClick={() => {
              setPickerYear(month.getFullYear());
              setPickerOpen((prev) => !prev);
            }}
            title="Ay ve yıl seçmek için tıklayın"
            style={{
              height: '100%',
              padding: '0 2px',
              border: 'none',
              background: pickerOpen
                ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
                : 'transparent',
              color: pickerOpen ? '#ffffff' : 'var(--foreground, #0f172a)',
              fontSize: '0.74rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ color: pickerOpen ? '#ffffff' : 'var(--foreground)' }}>
              {MONTHS_FULL_TR[month.getMonth()]} {month.getFullYear()}
            </span>
          </button>

          <button
            type="button"
            className="mini-cal-seg-arrow"
            onClick={() => stepMonth(1)}
            aria-label="Sonraki ay"
            title="Sonraki Ay"
            style={{
              ...capsuleArrowStyle,
              width: 22,
              borderLeft: '1px solid var(--input-border, #e2e8f0)',
            }}
          >
            <ChevronRight size={14} strokeWidth={2.4} />
          </button>
        </div>

        {/* 2. Kapsül: Gün Gezinmesi & Bugün Butonu */}
        <div
          style={{
            height: 32,
            borderRadius: 9,
            border: isTodaySelected
              ? '1px solid var(--input-border, #cbd5e1)'
              : '1px solid var(--badge-clinic-border, #93c5fd)',
            background: isTodaySelected
              ? 'var(--card-bg, #ffffff)'
              : 'var(--badge-clinic-bg, #e0f2fe)',
            boxShadow: isTodaySelected ? 'var(--pc-clay-btn)' : 'var(--pc-clay-pale)',
            display: 'grid',
            gridTemplateColumns: '22px minmax(0, 1fr) 22px',
            alignItems: 'center',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            className="mini-cal-seg-arrow"
            onClick={() => stepDay(-1)}
            aria-label={navigationCopy?.previous || 'Önceki gün'}
            title={navigationCopy?.previous || 'Önceki gün'}
            style={{
              ...capsuleArrowStyle,
              width: 22,
              borderRight: '1px solid var(--input-border, #cbd5e1)',
            }}
          >
            <ChevronLeft size={14} strokeWidth={2.4} />
          </button>

          <button
            type="button"
            onClick={handleTodayClick}
            title="Bugüne dön ve günlük görünümü aç"
            style={{
              height: '100%',
              padding: '0 2px',
              border: 'none',
              background: 'transparent',
              color: isTodaySelected
                ? 'var(--foreground, #0f172a)'
                : 'var(--badge-clinic-text, #0369a1)',
              fontSize: '0.73rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            Bugün
          </button>

          <button
            type="button"
            className="mini-cal-seg-arrow"
            onClick={() => stepDay(1)}
            aria-label={navigationCopy?.next || 'Sonraki gün'}
            title={navigationCopy?.next || 'Sonraki gün'}
            style={{
              ...capsuleArrowStyle,
              width: 22,
              borderLeft: '1px solid var(--input-border, #cbd5e1)',
            }}
          >
            <ChevronRight size={14} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {/* İnteraktif Hızlı Ay & Yıl Seçici Panel (Kasım 2026'ya Tıklanınca Açılır) */}
      {pickerOpen ? (
        <div
          style={{
            padding: 8,
            borderRadius: 10,
            background: 'var(--card-inner, #f1f5f9)',
            border: '1px solid var(--input-border, #cbd5e1)',
            boxShadow: 'var(--pc-neo-inset)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {/* Yıl Kaydırma Satırı (-5 Yıl, -1 Yıl, Yıl, +1 Yıl, +5 Yıl) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '26px 26px 1fr 26px 26px',
              alignItems: 'center',
              gap: 3,
              padding: 3,
              borderRadius: 8,
              background: 'var(--card-bg, #ffffff)',
              border: '1px solid var(--input-border, #cbd5e1)',
              boxShadow: 'var(--pc-clay-btn)',
            }}
          >
            <button
              type="button"
              className="mini-cal-seg-arrow"
              onClick={() => setPickerYear((y) => y - 5)}
              title="5 Yıl Geri"
              style={{ ...capsuleArrowStyle, width: 26, height: 24, borderRadius: 6 }}
            >
              <ChevronsLeft size={13} />
            </button>
            <button
              type="button"
              className="mini-cal-seg-arrow"
              onClick={() => setPickerYear((y) => y - 1)}
              title="Önceki Yıl"
              style={{ ...capsuleArrowStyle, width: 26, height: 24, borderRadius: 6 }}
            >
              <ChevronLeft size={14} />
            </button>
            <span
              style={{
                textAlign: 'center',
                fontSize: '0.82rem',
                fontWeight: 800,
                color: 'var(--foreground)',
              }}
            >
              {pickerYear}
            </span>
            <button
              type="button"
              className="mini-cal-seg-arrow"
              onClick={() => setPickerYear((y) => y + 1)}
              title="Sonraki Yıl"
              style={{ ...capsuleArrowStyle, width: 26, height: 24, borderRadius: 6 }}
            >
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              className="mini-cal-seg-arrow"
              onClick={() => setPickerYear((y) => y + 5)}
              title="5 Yıl İleri"
              style={{ ...capsuleArrowStyle, width: 26, height: 24, borderRadius: 6 }}
            >
              <ChevronsRight size={13} />
            </button>
          </div>

          {/* 12 Ay Hızlı Seçim Izgarası (Claymorphic Butonlar) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 5,
            }}
          >
            {MONTHS_SHORT_TR.map((mLabel, idx) => {
              const isCurrentMonth =
                month.getMonth() === idx && month.getFullYear() === pickerYear;
              return (
                <button
                  key={mLabel}
                  type="button"
                  onClick={() => selectMonthYear(idx, pickerYear)}
                  style={{
                    height: 30,
                    borderRadius: 8,
                    border: isCurrentMonth
                      ? '1px solid #1d4ed8'
                      : '1px solid var(--input-border, #cbd5e1)',
                    background: isCurrentMonth
                      ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
                      : 'var(--card-bg, #ffffff)',
                    color: isCurrentMonth ? '#ffffff' : 'var(--foreground)',
                    boxShadow: isCurrentMonth
                      ? 'var(--pc-clay-primary)'
                      : 'var(--pc-clay-btn)',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ color: isCurrentMonth ? '#ffffff' : 'var(--foreground)' }}>
                    {mLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mini-cal-wrap">
          <DayPicker
            mode="single"
            locale={tr}
            weekStartsOn={1}
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
              Caption: () => null,
              Day: (props) => {
                const dateStr = format(props.date, 'yyyy-MM-dd');
                const tooltipParts: string[] = [];

                const holName = holidayMap.get(dateStr);
                if (holName) {
                  tooltipParts.push(holName);
                } else {
                  const ch = customHolidays.find((c) => c.date === dateStr);
                  if (ch) tooltipParts.push(ch.name);
                }

                const dayLeaves = leavesByDateMap.get(dateStr) || [];
                for (const lv of dayLeaves) {
                  const docLabel = lv.doctorName || 'Hekim';
                  const spanLabel = lv.isFullDay ? 'Tüm Gün' : `${lv.startTime}-${lv.endTime}`;
                  const subLabel = lv.substituteDoctorName ? ` · Yerine: ${lv.substituteDoctorName}` : '';
                  tooltipParts.push(`🏖️ ${docLabel} İzinli (${spanLabel})${subLabel}`);
                }

                const title = tooltipParts.join(' | ');
                const isSelectedDay = dateStr === currentDate.slice(0, 10);

                return (
                  <div
                    className="custom-tooltip-container"
                    style={{
                      position: 'relative',
                      display: 'flex',
                      width: '100%',
                      height: '100%',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Day {...props} />
                    {dayLeaves.length > 0 && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          bottom: 3,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          backgroundColor: isSelectedDay ? '#ffffff' : '#f59e0b',
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                    {title && <div className="custom-tooltip">{title}</div>}
                  </div>
                );
              },
            }}
            showOutsideDays
          />
        </div>
      )}
    </div>
  );
}
