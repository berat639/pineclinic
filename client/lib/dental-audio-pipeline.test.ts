import { describe, expect, it } from 'vitest';
import {
  DentalVoicePipeline,
  PreRollAudioRingBuffer,
  combineBufferedTeethWithCommand,
  encodeFloat32ToWavBase64,
  extractFdiTeethFromText,
  isOnlyToothEnumeration,
  mergeAlternativesForDentalCommand,
  normalizeDentalCommandNumbers,
  type DentalBargeInEvent,
  type DentalCommandReadyPayload,
  type DentalPipelineStage,
} from './dental-audio-pipeline';

describe('DentalVoicePipeline — 5 Katmanlı Ses İşleme ve Turn/Barge-In Mimarisi', () => {
  it('Türkçe diş numaralarını ("on beş", "10 5", "5 16 17", "15\'e") eksiksiz FDI formatına normalize eder', () => {
    expect(normalizeDentalCommandNumbers('on beş zirkonyum ekle')).toBe('15 zirkonyum ekle');
    expect(normalizeDentalCommandNumbers('onbeş onaltı onyedi kompozit dolgu ekle')).toBe(
      '15 16 17 kompozit dolgu ekle'
    );
    expect(normalizeDentalCommandNumbers('10 5 10 6 10 7 zirkonyum ekle')).toBe(
      '15 16 17 zirkonyum ekle'
    );
    expect(normalizeDentalCommandNumbers('5 16 17 zirkonyum ekle')).toBe(
      '15 16 17 zirkonyum ekle'
    );
    expect(normalizeDentalCommandNumbers("15'e 16'ya 17'ye kanal tedavisi ekle")).toBe(
      '15 16 17 kanal tedavisi ekle'
    );
    expect(normalizeDentalCommandNumbers('151617 implant ekle')).toBe('15 16 17 implant ekle');
  });

  it('maxAlternatives=5 içinde birincil adayda "15" yutulmuşsa alternatif adaydan "15" diş numarasını kurtarır', () => {
    const merged = mergeAlternativesForDentalCommand([
      { transcript: 'beş zirkonyum ekle', confidence: 0.62 },
      { transcript: 'on beş zirkonyum ekle', confidence: 0.58 },
      { transcript: '15 zirkonyum kuron ekle', confidence: 0.55 },
    ]);

    expect(merged.extractedTeeth).toContain('15');
    expect(merged.primaryText).toContain('15');
    expect(merged.alternatives.length).toBeGreaterThanOrEqual(2);
  });

  it('500ms Pre-Roll Ring Buffer konuşma başlamadan önceki 500ms sesi WAV başına eksiksiz ekler', () => {
    const ring = new PreRollAudioRingBuffer(500, 16000);
    const frame = new Float32Array(320); // 20ms @ 16kHz

    // Konuşma başlamadan önce 25 çerçeve (500ms) pre-roll besle (değer: 0.25)
    frame.fill(0.25);
    for (let i = 0; i < 25; i++) {
      ring.pushFrame(frame, false);
    }

    // VAD SPEECH_START algıladı!
    ring.startUtteranceCapture();

    // Konuşma sırasında 10 çerçeve (200ms) besle (değer: 0.5)
    const speechFrame = new Float32Array(320).fill(0.5);
    for (let i = 0; i < 10; i++) {
      ring.pushFrame(speechFrame, true);
    }

    const contiguous = ring.getContiguousSamples();
    // 8000 (500ms pre-roll) + 3200 (200ms speech) = 11200 örnek (700ms)
    expect(contiguous.length).toBe(11200);
    expect(contiguous[0]).toBeCloseTo(0.25, 2);
    expect(contiguous[8000]).toBeCloseTo(0.5, 2);

    const { audioBase64, durationMs } = ring.flushToWavBase64(true);
    expect(durationMs).toBe(700);
    expect(audioBase64).toBeTruthy();

    // RIFF WAVE başlığını doğrula
    const rawBytes = Buffer.from(audioBase64!, 'base64');
    expect(rawBytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(rawBytes.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(rawBytes.readUInt32LE(24)).toBe(16000); // 16kHz
    expect(rawBytes.readUInt16LE(22)).toBe(1); // Mono
    expect(rawBytes.readUInt16LE(34)).toBe(16); // 16-bit PCM
  });

  it('Sadece diş numaraları söylendiğinde ("15", "16", "17") cümleyi kapatmaz (holding_numbers) ve işlem geldiğinde birleştirir', async () => {
    const stages: DentalPipelineStage[] = [];
    const payloads: DentalCommandReadyPayload[] = [];

    const pipeline = new DentalVoicePipeline({
      enumerationHoldMs: 2400,
      procedureSilenceMs: 200,
      onStageChange: (stage) => stages.push(stage),
      onCommandReady: (payload) => {
        payloads.push(payload);
      },
    });

    // Pipeline'a 500ms pre-roll ses çerçevesi besle
    const sampleFrame = new Float32Array(320).fill(0.18);
    pipeline.handleWorkletFrame({
      type: 'SPEECH_START',
      samples: sampleFrame,
      rms: 0.04,
      noiseFloor: 0.004,
      snrDb: 20,
      isNearFieldSpeech: true,
      passSpeech: true,
    });

    // 1. Hekim "15" diyor -> sadece diş numarası olduğu için kapatmamalı!
    pipeline.handleRecognitionResult({
      results: [
        Object.assign([{ transcript: 'on beş', confidence: 0.92 }], { isFinal: true }),
      ],
    });

    expect(pipeline.currentStage).toBe('holding_numbers');
    expect(pipeline.bufferedTeeth).toEqual(['15']);
    expect(payloads.length).toBe(0);

    // 2. Hekim 1 sn duraksayıp "16" diyor -> hala sadece diş numarası, kapatmamalı!
    pipeline.handleRecognitionResult({
      results: [
        Object.assign([{ transcript: '16', confidence: 0.94 }], { isFinal: true }),
      ],
    });
    expect(pipeline.currentStage).toBe('holding_numbers');
    expect(pipeline.bufferedTeeth).toEqual(['15', '16']);
    expect(payloads.length).toBe(0);

    // 3. Hekim 1 sn duraksayıp "17" diyor -> hala sadece diş numarası!
    pipeline.handleRecognitionResult({
      results: [
        Object.assign([{ transcript: '17', confidence: 0.95 }], { isFinal: true }),
      ],
    });
    expect(pipeline.currentStage).toBe('holding_numbers');
    expect(pipeline.bufferedTeeth).toEqual(['15', '16', '17']);
    expect(payloads.length).toBe(0);

    // 4. Hekim "zirkonyum ekle" diyor -> biriktirilen "15 16 17" ile birleştirilip AI'ya gönderilmeli!
    (pipeline as any).running = true;
    pipeline.handleRecognitionResult({
      results: [
        Object.assign(
          [
            { transcript: 'zirkonyum ekle', confidence: 0.96 },
            { transcript: 'zirkonyum kuron ekle', confidence: 0.88 },
          ],
          { isFinal: true }
        ),
      ],
    });

    await new Promise((r) => setTimeout(r, 220));

    expect(payloads.length).toBe(1);
    expect(payloads[0].text).toBe('15 16 17 zirkonyum ekle');
    expect(payloads[0].bufferedTeeth).toEqual(['15', '16', '17']);
    expect(payloads[0].audioMimeType).toBe('audio/wav');
    expect(payloads[0].audioBase64).toBeTruthy();
    expect(payloads[0].alternatives.length).toBeGreaterThanOrEqual(2);

    pipeline.stop();
  });

  it('AI analiz yaparken (isAnalyzing=true) 180ms kesintisiz yakın-alan konuşmada Barge-In tetikler ve AbortSignal iptal eder', () => {
    const bargeIns: DentalBargeInEvent[] = [];
    const stages: DentalPipelineStage[] = [];

    const pipeline = new DentalVoicePipeline({
      bargeInMinSpeechMs: 180,
      onStageChange: (s) => stages.push(s),
      onBargeIn: (ev) => bargeIns.push(ev),
      onCommandReady: () => {},
    });

    const abortSignal = pipeline.beginAnalyzing();
    expect(pipeline.isAnalyzing).toBe(true);
    expect(abortSignal.aborted).toBe(false);

    // Öksürük veya bastırılmış (suppressed) gürültü Barge-In tetiklememeli
    for (let i = 0; i < 12; i++) {
      pipeline.handleWorkletFrame({
        type: 'FRAME',
        samples: new Float32Array(320),
        rms: 0.08,
        noiseFloor: 0.005,
        snrDb: 24,
        isNearFieldSpeech: false,
        suppressed: true,
      });
    }
    expect(abortSignal.aborted).toBe(false);
    expect(bargeIns.length).toBe(0);

    // 9 çerçeve x 20ms = 180ms kesintisiz yakın-alan hekim konuşması -> Barge-In tetiklenmeli!
    for (let i = 0; i < 9; i++) {
      pipeline.handleWorkletFrame({
        type: 'FRAME',
        samples: new Float32Array(320).fill(0.22),
        rms: 0.055,
        noiseFloor: 0.004,
        snrDb: 22.8,
        isNearFieldSpeech: true,
        suppressed: false,
      });
    }

    expect(abortSignal.aborted).toBe(true);
    expect(pipeline.isAnalyzing).toBe(false);
    expect(pipeline.currentStage).toBe('barge_in');
    expect(bargeIns.length).toBe(1);
    expect(bargeIns[0].abortedActiveRequest).toBe(true);
    expect(bargeIns[0].durationMs).toBeGreaterThanOrEqual(180);

    pipeline.stop();
  });

  it('isOnlyToothEnumeration ve combineBufferedTeethWithCommand yardımcılarını doğru çalıştırır', () => {
    expect(isOnlyToothEnumeration('15')).toBe(true);
    expect(isOnlyToothEnumeration('15 16 17')).toBe(true);
    expect(isOnlyToothEnumeration('15 ve 16 numaralı dişler')).toBe(true);
    expect(isOnlyToothEnumeration('15 16 zirkonyum')).toBe(false);
    expect(isOnlyToothEnumeration('15 16 seç')).toBe(false);

    expect(combineBufferedTeethWithCommand(['15', '16', '17'], 'zirkonyum ekle')).toBe(
      '15 16 17 zirkonyum ekle'
    );
    expect(combineBufferedTeethWithCommand(['15', '16', '17'], '17 zirkonyum ekle')).toBe(
      '15 16 17 zirkonyum ekle'
    );
    expect(extractFdiTeethFromText('on beş 16 17 zirkonyum')).toEqual(['15', '16', '17']);
    expect(encodeFloat32ToWavBase64(new Float32Array(160))).toBeTruthy();
  });
});
