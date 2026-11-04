/**
 * 2B Chart ve 3B Anatomik Odontogram üzerinde çoklu diş seçimi aktifken
 * sürükle-bırak (drag & drop) ile tedavi veya endikasyon atandığında
 * hedeflenecek diş listesini çözer.
 */
export function isFdiToothNumber(value: number | string): boolean {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || ['upper', 'lower', 'general'].includes(trimmed.toLowerCase())) {
      return false;
    }
    const parsed = Number(trimmed);
    return Number.isInteger(parsed) && parsed >= 11 && parsed <= 85;
  }
  return typeof value === 'number' && Number.isInteger(value) && value >= 11 && value <= 85;
}

export function resolveMultiToothDragTargets(
  droppedTooth: number | string,
  selectedTeeth: number[] = []
): (number | string)[] {
  if (!isFdiToothNumber(droppedTooth)) {
    return [droppedTooth];
  }

  const numericTarget = Number(droppedTooth);
  const normalizedSelected = Array.isArray(selectedTeeth)
    ? Array.from(
        new Set(
          selectedTeeth
            .map((t) => Number(t))
            .filter((t) => Number.isInteger(t) && t >= 11 && t <= 85)
        )
      )
    : [];

  if (normalizedSelected.length > 1) {
    if (normalizedSelected.includes(numericTarget)) {
      return [...normalizedSelected];
    }
    return Array.from(new Set([...normalizedSelected, numericTarget]));
  }

  return [numericTarget];
}

/**
 * Sürükle-bırak olayındaki DataTransfer nesnesinden tedavi/işlem verisini
 * güvenli biçimde JSON olarak ayrıştırır.
 */
export function parseDraggedTreatmentPayload(
  dataTransfer: Pick<DataTransfer, 'getData'> | null | undefined
): any | null {
  if (!dataTransfer || typeof dataTransfer.getData !== 'function') {
    return null;
  }

  const type = dataTransfer.getData('type') || '';
  const raw =
    dataTransfer.getData('value') ||
    dataTransfer.getData('application/json') ||
    dataTransfer.getData('text/plain') ||
    '';

  if (!raw || !raw.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        ...(type && !('type' in parsed) ? { type } : {}),
        ...parsed,
      };
    }
    return parsed;
  } catch {
    return null;
  }
}
