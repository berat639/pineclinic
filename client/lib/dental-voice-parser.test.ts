import { describe, expect, it } from 'vitest';
import {
  extractAllFdiTeethInOrder,
  extractDentalSurfaces,
  matchSpokenMaterials,
  mergeBufferedTeethWithCommand,
  parseStructuredOrLocalDentalCommand,
  pickBestSpeechAlternative,
  repairTurkishDentalPhonetics,
  resolveAutoLinkedIndications,
} from './dental-voice-parser';

describe('dental-voice-parser (Madde 5 & Madde 5.1)', () => {
  describe('repairTurkishDentalPhonetics', () => {
    it('repairs STT phonetic errors like "koyun ekmek" -> "zirkonyum ekle"', () => {
      expect(repairTurkishDentalPhonetics('17 koyun ekmek')).toBe('17 zirkonyum ekle');
      expect(repairTurkishDentalPhonetics('15 16 17 zirkon ekmek')).toBe('15 16 17 zirkonyum ekle');
      expect(repairTurkishDentalPhonetics('21 sirkonyum ekli')).toBe('21 zirkonyum ekle');
    });

    it('repairs surface, composite and action phonetic errors', () => {
      expect(repairTurkishDentalPhonetics('36 mezar okul dijital komplo ekler')).toBe(
        '36 mezyal oklüzal distal kompozit ekle'
      );
      expect(repairTurkishDentalPhonetics('26 bakkal em o de komplo ekmek')).toBe(
        '26 bukkal MOD kompozit ekle'
      );
      expect(repairTurkishDentalPhonetics('16 em o 17 de o dolgu ekli')).toBe(
        '16 MO 17 DO dolgu ekle'
      );
    });

    it('normalizes Turkish number words, concatenated FDI teeth, and truncated sequences', () => {
      expect(repairTurkishDentalPhonetics('on beş on altı on yedi koyun ekmek')).toBe(
        '15 16 17 zirkonyum ekle'
      );
      expect(repairTurkishDentalPhonetics('151617 zirkonyum ekle')).toBe('15 16 17 zirkonyum ekle');
      expect(repairTurkishDentalPhonetics('5 16 17 zirkonyum ekle')).toBe('15 16 17 zirkonyum ekle');
      expect(repairTurkishDentalPhonetics('15 6 7 zirkonyum ekle')).toBe('15 16 17 zirkonyum ekle');
      expect(repairTurkishDentalPhonetics('36 7 8 kompozit dolgu ekle')).toBe(
        '36 37 38 kompozit dolgu ekle'
      );
    });
  });

  describe('Madde 5: Duraksama Toleranslı Diş Tamponu + Fonetik Düzeltme', () => {
    it('handles "15 16 17" + 1s pause + "17 koyun ekmek" without losing initial teeth', () => {
      const bufferedTeeth = extractAllFdiTeethInOrder('15 16 17');
      expect(bufferedTeeth).toEqual(['15', '16', '17']);

      const merged = mergeBufferedTeethWithCommand(bufferedTeeth, '17 koyun ekmek');
      expect(merged).toBe('15 16 17 zirkonyum ekle');

      const parsed = parseStructuredOrLocalDentalCommand('17 koyun ekmek', {
        bufferedTeeth: ['15', '16', '17'],
      });

      expect(parsed.toothNumbers).toEqual(['15', '16', '17']);
      expect(parsed.procedureName).toBe('Zirkonyum Kuron');
      expect(parsed.intent).toBe('ADD');
      expect(parsed.treatments).toHaveLength(1);
      expect(parsed.treatments[0]).toMatchObject({
        toothNumbers: ['15', '16', '17'],
        procedureName: 'Zirkonyum Kuron',
        intent: 'ADD',
      });
    });

    it('also handles directly concatenated pause transcript "15 16 17 17 koyun ekmek"', () => {
      const parsed = parseStructuredOrLocalDentalCommand('15 16 17 17 koyun ekmek');
      expect(parsed.toothNumbers).toEqual(['15', '16', '17']);
      expect(parsed.procedureName).toBe('Zirkonyum Kuron');
      expect(parsed.intent).toBe('ADD');
    });
  });

  describe('Madde 5.1: Yapılandırılmış Şablon Çözümleme', () => {
    it('parses "36, 37 38 Endikasyonu: Çürük, Tedavi: Kompozit Dolgu, Yüzeyler Mezial, Okluzal, Distal"', () => {
      const input =
        '36, 37 38 Endikasyonu: Çürük, Tedavi: Kompozit Dolgu, Yüzeyler Mezial, Okluzal, Distal';
      const parsed = parseStructuredOrLocalDentalCommand(input);

      expect(parsed.isStructured51).toBe(true);
      expect(parsed.toothNumbers).toEqual(['36', '37', '38']);
      expect(parsed.indication).toBe('Çürük');
      expect(parsed.procedureName).toBe('Kompozit Dolgu (Tek Yüzey)');
      expect(parsed.surfaces).toEqual(['M', 'O', 'D']);
      expect(parsed.intent).toBe('ADD');
      expect(parsed.treatments[0]).toMatchObject({
        toothNumbers: ['36', '37', '38'],
        indication: 'Çürük',
        procedureName: 'Kompozit Dolgu (Tek Yüzey)',
        surfaces: ['M', 'O', 'D'],
        intent: 'ADD',
      });
    });

    it('parses "36, Endikasyonu: Çürük, Tedavi: Kompozit Dolgu, Yüzeyler MOD"', () => {
      const input = '36, Endikasyonu: Çürük, Tedavi: Kompozit Dolgu, Yüzeyler MOD';
      const parsed = parseStructuredOrLocalDentalCommand(input);

      expect(parsed.isStructured51).toBe(true);
      expect(parsed.toothNumbers).toEqual(['36']);
      expect(parsed.indication).toBe('Çürük');
      expect(parsed.procedureName).toBe('Kompozit Dolgu (Tek Yüzey)');
      expect(parsed.surfaces).toEqual(['M', 'O', 'D']);
      expect(parsed.intent).toBe('ADD');
      expect(parsed.treatments[0]).toMatchObject({
        toothNumbers: ['36'],
        indication: 'Çürük',
        procedureName: 'Kompozit Dolgu (Tek Yüzey)',
        surfaces: ['M', 'O', 'D'],
        intent: 'ADD',
      });
    });
  });

  describe('Malzeme ve Silme (DELETE) Komutları', () => {
    const sampleInventory = [
      { id: 'inv-1', name: '3M Filtek Z250 Kompozit', costPerUnit: 120, unitSalePriceMinor: 25000 },
      { id: 'inv-2', name: 'Straumann Kemik İçi İmplant', costPerUnit: 3500, unitSalePriceMinor: 500000 },
      { id: 'inv-3', name: 'Vita Zirkonyum Blok', costPerUnit: 800, unitSalePriceMinor: 120000 },
    ];

    it('extracts spoken materials from voice command and attaches them to treatment', () => {
      const parsed = parseStructuredOrLocalDentalCommand(
        '15 16 17 zirkonyum ekle malzeme Vita Zirkonyum Blok',
        { inventory: sampleInventory }
      );

      expect(parsed.toothNumbers).toEqual(['15', '16', '17']);
      expect(parsed.procedureName).toBe('Zirkonyum Kuron');
      expect(parsed.intent).toBe('ADD');
      expect(parsed.materials).toHaveLength(1);
      expect(parsed.materials[0]).toMatchObject({
        id: 'inv-3',
        inventoryItemId: 'inv-3',
        name: 'Vita Zirkonyum Blok',
      });
      expect(parsed.treatments[0].materials[0].name).toBe('Vita Zirkonyum Blok');
    });

    it('matches materials directly via matchSpokenMaterials', () => {
      const mats = matchSpokenMaterials('36 MOD kompozit dolgu 3M Filtek ekle', sampleInventory);
      expect(mats).toHaveLength(1);
      expect(mats[0].name).toBe('3M Filtek Z250 Kompozit');
    });

    it('parses DELETE intent for procedure removal and tooth-wide deletion', () => {
      const deleteProc = parseStructuredOrLocalDentalCommand('15 16 zirkonyum sil');
      expect(deleteProc.toothNumbers).toEqual(['15', '16']);
      expect(deleteProc.procedureName).toBe('Zirkonyum Kuron');
      expect(deleteProc.intent).toBe('DELETE');
      expect(deleteProc.treatments[0]).toMatchObject({
        toothNumbers: ['15', '16'],
        procedureName: 'Zirkonyum Kuron',
        intent: 'DELETE',
      });

      const deleteTooth = parseStructuredOrLocalDentalCommand('36 sil');
      expect(deleteTooth.toothNumbers).toEqual(['36']);
      expect(deleteTooth.procedureName).toBeNull();
      expect(deleteTooth.intent).toBe('DELETE');
    });
  });

  describe('Otomatik Bağlı Endikasyon (indicationLinks) Kuralı', () => {
    it('automatically attaches linked indications when user does not speak an indication', () => {
      const indicationLinks = {
        'Zirkonyum Kuron': ['Kuron Kırığı', 'Estetik Kaygı'],
        'Kompozit Dolgu (Tek Yüzey)': ['Derin Çürük'],
      };

      const parsed = parseStructuredOrLocalDentalCommand('15 16 17 koyun ekmek', {
        indicationLinks,
      });

      expect(parsed.toothNumbers).toEqual(['15', '16', '17']);
      expect(parsed.procedureName).toBe('Zirkonyum Kuron');
      expect(parsed.intent).toBe('ADD');
      expect(parsed.indications).toEqual(['Kuron Kırığı', 'Estetik Kaygı']);
      expect(parsed.indication).toBe('Kuron Kırığı');
      expect(parsed.treatments[0].indications).toEqual(['Kuron Kırığı', 'Estetik Kaygı']);
    });

    it('supports reverse indication->procedure mapping in resolveAutoLinkedIndications and merges with 5.1 indication', () => {
      const reverseLinks = {
        'Sekonder Çürük': ['Kompozit Dolgu (Tek Yüzey)'],
      };

      const autoOnly = resolveAutoLinkedIndications('Kompozit Dolgu (Tek Yüzey)', reverseLinks);
      expect(autoOnly).toEqual(['Sekonder Çürük']);

      const parsed51WithLinks = parseStructuredOrLocalDentalCommand(
        '36, Endikasyonu: Çürük, Tedavi: Kompozit Dolgu, Yüzeyler MOD',
        { indicationLinks: reverseLinks }
      );
      expect(parsed51WithLinks.indication).toBe('Çürük');
      expect(parsed51WithLinks.indications).toEqual(['Çürük', 'Sekonder Çürük']);
    });
  });

  describe('pickBestSpeechAlternative & extractDentalSurfaces', () => {
    it('selects the best STT alternative containing dental teeth and phonetic match', () => {
      const best = pickBestSpeechAlternative([
        { transcript: '17 koyun', confidence: 0.92 },
        { transcript: '15 16 17 zirkonyum ekle', confidence: 0.78 },
      ]);
      expect(best).toBe('15 16 17 zirkonyum ekle');
    });

    it('extracts surfaces accurately from full names and abbreviations', () => {
      expect(extractDentalSurfaces('Mezial, Okluzal, Distal')).toEqual(['M', 'O', 'D']);
      expect(extractDentalSurfaces('MOD')).toEqual(['M', 'O', 'D']);
      expect(extractDentalSurfaces('MO')).toEqual(['M', 'O']);
      expect(extractDentalSurfaces('DO')).toEqual(['D', 'O']);
      expect(extractDentalSurfaces('Bukkal ve Palatinal')).toEqual(['B', 'L']);
    });
  });
});
