import { describe, expect, it } from 'vitest';
import {
  parseDraggedTreatmentPayload,
  resolveMultiToothDragTargets,
} from './treatment-drag-drop';

describe('resolveMultiToothDragTargets', () => {
  it('hiç diş seçili değilken veya tek diş seçili iken 16 numaralı dişe bırakıldığında [16] döndürür', () => {
    expect(resolveMultiToothDragTargets(16, [])).toEqual([16]);
    expect(resolveMultiToothDragTargets(16, [16])).toEqual([16]);
    expect(resolveMultiToothDragTargets(16, [15])).toEqual([16]);
    expect(resolveMultiToothDragTargets('16', [])).toEqual([16]);
  });

  it('15, 16, 17 seçili iken 16 numaralı dişe bırakıldığında [15, 16, 17] döndürür', () => {
    expect(resolveMultiToothDragTargets(16, [15, 16, 17])).toEqual([15, 16, 17]);
  });

  it('15, 16 seçili iken 17 numaralı dişe bırakıldığında [15, 16, 17] döndürür', () => {
    expect(resolveMultiToothDragTargets(17, [15, 16])).toEqual([15, 16, 17]);
  });

  it('bölgesel hedeflerde (upper, lower, general) yalnızca ilgili bölgeyi döndürür', () => {
    expect(resolveMultiToothDragTargets('upper', [15, 16, 17])).toEqual(['upper']);
    expect(resolveMultiToothDragTargets('lower', [36, 37])).toEqual(['lower']);
    expect(resolveMultiToothDragTargets('general', [11, 21])).toEqual(['general']);
  });
});

describe('parseDraggedTreatmentPayload', () => {
  it('value veya application/json verisini güvenle parse eder', () => {
    const dt = {
      getData: (key: string) => {
        if (key === 'type') return 'treatment';
        if (key === 'value') return JSON.stringify({ id: 'cat-1', name: 'Kompozit Dolgu' });
        return '';
      },
    };
    expect(parseDraggedTreatmentPayload(dt)).toEqual({
      type: 'treatment',
      id: 'cat-1',
      name: 'Kompozit Dolgu',
    });
  });

  it('bozuk veya boş verilerde null döndürür', () => {
    expect(parseDraggedTreatmentPayload(null)).toBeNull();
    expect(parseDraggedTreatmentPayload({ getData: () => 'gecersiz-json' })).toBeNull();
  });
});
