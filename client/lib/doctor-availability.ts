export interface DoctorAvailabilityOption {
  id: string;
  name: string;
  specialty?: string;
  color?: string;
}

export interface ShiftRecord {
  userId: string;
  date: string;
  startTime?: string;
  endTime?: string;
}

export interface DoctorLeaveRecord {
  id?: string;
  doctorId: string;
  doctorName?: string;
  substituteDoctorId?: string | null;
  substituteDoctorName?: string | null;
  date: string;
  startTime?: string;
  endTime?: string;
  isFullDay?: boolean;
  reason?: string | null;
}

export interface DoctorAvailabilityResult {
  valid: boolean;
  reasonType?: 'full_day_leave' | 'partial_leave' | 'no_shift' | 'outside_shift';
  badgeText: string;
  badgeVariant: 'available' | 'leave' | 'no_shift' | 'neutral';
  message: string;
}

function parseHHMM(hhmm: string | undefined | null, fallback = 0): number {
  if (!hhmm) return fallback;
  const [hStr, mStr] = String(hhmm).split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h)) return fallback;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

function isMinuteInShift(minutes: number, shift: ShiftRecord): boolean {
  const sStart = parseHHMM(shift.startTime || '00:00', 0);
  let sEnd = parseHHMM(shift.endTime || '23:59', 1440);
  if (sEnd <= sStart) sEnd += 1440;
  let checkMin = minutes;
  if (sEnd > 1440 && checkMin < sStart) checkMin += 1440;
  return checkMin >= sStart && checkMin <= sEnd;
}

function isMinuteInLeave(minutes: number, leave: DoctorLeaveRecord): boolean {
  if (leave.isFullDay) return true;
  const lStart = parseHHMM(leave.startTime || '00:00', 0);
  const lEnd = parseHHMM(leave.endTime || '23:59', 1440);
  return minutes >= lStart && minutes < lEnd;
}

export function checkDoctorAvailability(
  doctorId: string,
  doctors: DoctorAvailabilityOption[] = [],
  shifts: ShiftRecord[] = [],
  doctorLeaves: DoctorLeaveRecord[] = [],
  targetDateTime?: string | Date | null,
  contextLabel = ''
): DoctorAvailabilityResult {
  const doc = (doctors || []).find((d) => d.id === doctorId);
  const docName = doc?.name || 'Seçilen hekim';

  if (!targetDateTime) {
    return {
      valid: true,
      badgeText: doc?.specialty || '',
      badgeVariant: 'neutral',
      message: '',
    };
  }

  let dateStr = '';
  let hasSpecificTime = false;
  let minutes = 0;
  let timeStr = '';

  if (typeof targetDateTime === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(targetDateTime.trim())) {
    dateStr = targetDateTime.trim();
    hasSpecificTime = false;
  } else {
    const parsed = new Date(targetDateTime);
    if (isNaN(parsed.getTime())) {
      return {
        valid: true,
        badgeText: doc?.specialty || '',
        badgeVariant: 'neutral',
        message: '',
      };
    }
    dateStr = parsed.toLocaleDateString('sv');
    hasSpecificTime = true;
    minutes = parsed.getHours() * 60 + parsed.getMinutes();
    timeStr = `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
  }

  const dateObjForLabel = new Date(`${dateStr}T12:00:00`);
  const formattedDate = isNaN(dateObjForLabel.getTime())
    ? dateStr
    : dateObjForLabel.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        weekday: 'long',
      });

  // Bu tarih ve saatte mesaisi olan ve izinli olmayan uygun hekimleri bul
  const availableDoctorsList = (doctors || [])
    .filter((other) => {
      if (other.id === doctorId) return false;
      const otherLeaves = (doctorLeaves || []).filter(
        (l) => l && l.doctorId === other.id && l.date === dateStr
      );
      if (otherLeaves.some((l) => Boolean(l.isFullDay))) return false;
      if (hasSpecificTime && otherLeaves.some((l) => isMinuteInLeave(minutes, l))) return false;

      const otherShifts = (shifts || []).filter(
        (s) => s && s.userId === other.id && s.date === dateStr
      );
      if (otherShifts.length === 0) return false;
      if (hasSpecificTime && !otherShifts.some((s) => isMinuteInShift(minutes, s))) return false;
      return true;
    })
    .map((other) => {
      const otherShifts = (shifts || []).filter(
        (s) => s && s.userId === other.id && s.date === dateStr
      );
      const ranges = otherShifts.map((s) => `${s.startTime}–${s.endTime}`).join(', ');
      return ranges ? `${other.name} (${ranges})` : other.name;
    });

  const prefix = contextLabel ? `${contextLabel.trim()} ` : '';
  const availHint =
    availableDoctorsList.length > 0
      ? ` Uygun mesaisi olan hekimler: ${availableDoctorsList.join(', ')}.`
      : '';

  // 1. İzin kontrolü (Tüm gün veya saatlik izin)
  const dayLeaves = (doctorLeaves || []).filter(
    (l) => l && l.doctorId === doctorId && l.date === dateStr
  );

  const fullDayLeave = dayLeaves.find((l) => Boolean(l.isFullDay));
  if (fullDayLeave) {
    const subName =
      fullDayLeave.substituteDoctorName ||
      (fullDayLeave.substituteDoctorId
        ? (doctors || []).find((d) => d.id === fullDayLeave.substituteDoctorId)?.name
        : null);
    const reasonText = fullDayLeave.reason ? ` (İzin nedeni: ${fullDayLeave.reason})` : '';
    const subText = subName ? ` Yerine bakan hekim: ${subName}.` : '';
    return {
      valid: false,
      reasonType: 'full_day_leave',
      badgeText: `⛔ Tüm Gün İzinli${fullDayLeave.reason ? ` · ${fullDayLeave.reason}` : ''}`,
      badgeVariant: 'leave',
      message: `⚠️ ${prefix}${docName} seçilemez ve kaydedilemez: ${formattedDate} tarihinde tüm gün izinlidir${reasonText}.${subText}${availHint}`,
    };
  }

  if (hasSpecificTime) {
    const overlappingLeave = dayLeaves.find((l) => !l.isFullDay && isMinuteInLeave(minutes, l));
    if (overlappingLeave) {
      const subName =
        overlappingLeave.substituteDoctorName ||
        (overlappingLeave.substituteDoctorId
          ? (doctors || []).find((d) => d.id === overlappingLeave.substituteDoctorId)?.name
          : null);
      const reasonText = overlappingLeave.reason ? ` (İzin nedeni: ${overlappingLeave.reason})` : '';
      const subText = subName ? ` Yerine bakan hekim: ${subName}.` : '';
      const leaveRange = `${overlappingLeave.startTime || '00:00'}–${overlappingLeave.endTime || '23:59'}`;
      return {
        valid: false,
        reasonType: 'partial_leave',
        badgeText: `⛔ İzinli (${leaveRange})`,
        badgeVariant: 'leave',
        message: `⚠️ ${prefix}${docName} seçilemez ve kaydedilemez: ${formattedDate} tarihinde ${leaveRange} saatleri arasında izinlidir${reasonText}. Randevu saati (${timeStr}) hekimin izin saatleriyle çakışmaktadır.${subText}${availHint}`,
      };
    }
  } else if (dayLeaves.length > 0) {
    const firstLeave = dayLeaves[0];
    const leaveRange = `${firstLeave.startTime || '00:00'}–${firstLeave.endTime || '23:59'}`;
    const reasonText = firstLeave.reason ? ` (İzin nedeni: ${firstLeave.reason})` : '';
    return {
      valid: false,
      reasonType: 'partial_leave',
      badgeText: `⛔ İzinli (${leaveRange})`,
      badgeVariant: 'leave',
      message: `⚠️ ${prefix}${docName} seçilemez ve kaydedilemez: ${formattedDate} tarihinde ${leaveRange} saatleri arasında izinlidir${reasonText}.${availHint}`,
    };
  }

  // 2. Mesai / Vardiya kontrolü
  const docShifts = (shifts || []).filter(
    (s) => s && s.userId === doctorId && s.date === dateStr
  );

  if (docShifts.length === 0) {
    return {
      valid: false,
      reasonType: 'no_shift',
      badgeText: '⚠️ Mesai Yok',
      badgeVariant: 'no_shift',
      message: `⚠️ ${prefix}${docName} seçilemez ve kaydedilemez: ${formattedDate} tarihinde tanımlı mesaisi (vardiyası) bulunmamaktadır.${availHint}`,
    };
  }

  const shiftRanges = docShifts.map((s) => `${s.startTime}–${s.endTime}`).join(', ');

  if (hasSpecificTime) {
    const isCovered = docShifts.some((s) => isMinuteInShift(minutes, s));
    if (!isCovered) {
      return {
        valid: false,
        reasonType: 'outside_shift',
        badgeText: `⚠️ Mesai Dışı (${shiftRanges})`,
        badgeVariant: 'no_shift',
        message: `⚠️ ${prefix}${docName} seçilemez ve kaydedilemez: ${formattedDate} tarihindeki mesai saatleri ${shiftRanges} arasındadır; ancak randevu saati (${timeStr}) hekimin mesai saatleri dışındadır.${availHint}`,
      };
    }
  }

  return {
    valid: true,
    badgeText: `🟢 ${shiftRanges}`,
    badgeVariant: 'available',
    message: '',
  };
}

