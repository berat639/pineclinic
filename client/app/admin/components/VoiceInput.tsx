'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────
export interface VoiceInputState {
  isListening: boolean
  transcript: string
  interimTranscript: string
  error: string | null
  supported: boolean
}

export interface UseVoiceInputReturn extends VoiceInputState {
  start: () => void
  stop: () => void
  reset: () => void
}

// ── Hook: useVoiceInput ────────────────────────────────────────────────────
// Wraps the Web Speech API SpeechRecognition in a simple React hook.
export function useVoiceInput(lang = 'tr-TR', continuous = false): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  
  const recognitionRef = useRef<any>(null)
  const shouldListenRef = useRef(false)
  const retryTimeoutRef = useRef<any>(null)

  const supported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const stop = useCallback(() => {
    shouldListenRef.current = false
    clearTimeout(retryTimeoutRef.current)
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  const start = useCallback(() => {
    if (!supported) {
      setError('Tarayıcınız ses tanıma desteklemiyor')
      return
    }
    
    setError(null)
    setTranscript('')
    setInterimTranscript('')
    shouldListenRef.current = true

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.lang = lang
    // Tarayıcıların bazılarında continuous mode stabil değil, bu yüzden onend ile manuel restart daha güvenli olabilir.
    // Ancak yine de continuous true olarak başlatıyoruz.
    recognition.continuous = continuous
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setIsListening(true)
      setError(null)
    }

    recognition.onresult = (event: any) => {
      let finalStr = ''
      let interimStr = ''
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalStr += result[0].transcript + ' '
        } else {
          interimStr += result[0].transcript
        }
      }
      
      if (finalStr.trim()) {
        setTranscript(prev => (prev + ' ' + finalStr).trim())
        setInterimTranscript('')
      } else if (interimStr.trim()) {
        setInterimTranscript(interimStr.trim())
      }
    }

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'network') {
        // no-speech veya anlık ağ kopmalarında sistemi tamamen kapatmamak için retry mekanizması
        if (continuous && shouldListenRef.current) {
          return // onend üzerinden restart denenecek
        }
      }
      
      const msgs: Record<string, string> = {
        'not-allowed': 'Mikrofon erişimi reddedildi',
        'network': 'Ağ hatası',
        'audio-capture': 'Mikrofon bulunamadı',
        'no-speech': 'Ses algılanamadı',
      }
      setError(msgs[event.error] || `Hata: ${event.error}`)
      
      if (event.error === 'not-allowed' || event.error === 'audio-capture') {
        setIsListening(false)
        shouldListenRef.current = false
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      // Sürekli dinleme (Siri) modundaysa, hata yoksa veya no-speech ise hemen tekrar başlat
      if (continuous && shouldListenRef.current) {
        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = setTimeout(() => {
          if (shouldListenRef.current && recognitionRef.current) {
            try { recognitionRef.current.start() } catch (e) { console.warn(e) }
          }
        }, 300) // Kısa bekleme süresiyle yeniden başlat
      }
    }

    recognitionRef.current = recognition
    try { recognition.start() } catch(e) { console.warn(e) }
  }, [supported, lang, continuous])

  const reset = useCallback(() => {
    setTranscript('')
    setInterimTranscript('')
    setError(null)
    if (!continuous) {
      stop()
    }
  }, [stop, continuous])

  useEffect(() => {
    return () => {
      shouldListenRef.current = false
      clearTimeout(retryTimeoutRef.current)
      recognitionRef.current?.abort()
    }
  }, [])

  return { isListening, transcript, interimTranscript, error, supported, start, stop, reset }
}

// ── Voice Parser ───────────────────────────────────────────────────────────
export interface ParsedTreatment {
  procedureName?: string
  toothNumbers?: string[]
  indication?: string
  cost?: number
  groupName?: string
  groupDescription?: string
  isWakeWord?: boolean
  intent?: 'ADD' | 'DELETE' | 'CONFIRM'
}

export interface ParsedDisease {
  name: string
  intent?: 'ADD' | 'DELETE'
}

export interface ParsedConsultation {
  name: string
  intent?: 'ADD' | 'DELETE'
}

export interface AIParsedData {
  treatments?: ParsedTreatment[]
  diseases?: ParsedDisease[]
  consultations?: ParsedConsultation[]
}

export function parseTreatmentVoice(text: string): ParsedTreatment {
  const lower = text.toLowerCase()
  const result: ParsedTreatment = {}

  // 1. Wake word & Intent algılama
  if (/(?:hey asistan|asistan|siri|dinle|duyuyor musun)/i.test(lower)) {
    result.isWakeWord = true
  }

  if (/(?:sil|çıkar|çıkart|iptal|kaldır|temizle|vazgeç|listeden çıkart)/i.test(lower)) {
    result.intent = 'DELETE'
  } else if (/(?:onayla|evet|kabul|tamam)/i.test(lower)) {
    result.intent = 'CONFIRM'
  } else if (/(?:kaydet|ekle|ilave et|oluştur)/i.test(lower)) {
    result.intent = 'ADD'
  } else {
    result.intent = 'ADD'
  }

  // 2. Diş numaraları: "15 numara", "diş 15", "15, 16 ve 17 numaralı dişler"
  const fdiPattern = /\b([1-4][1-8])\b/g
  const matches = [...lower.matchAll(fdiPattern)]
  if (matches.length > 0) {
    result.toothNumbers = Array.from(new Set(matches.map(m => m[1])))
  } else {
    // "Altı numara", "üst sol yirmi yaş" gibi karmaşık komutlar yerine temel "diş no" pattern'ine bakalım
    const toothMatch = lower.match(/(?:diş\s*(?:no\.?|numarası?|#)?\s*(\d{1,2}))|(?:(\d{1,2})\s*(?:no\.?|numaralı)\s*diş)/i)
    if (toothMatch) {
      result.toothNumbers = [(toothMatch[1] || toothMatch[2] || '').trim()]
    }
  }

  // 3. Ücret: "ücret 2500 lira", "2500 tl"
  const costMatch = lower.match(/(?:ücret|fiyat|tutar|maliyet)?\s*(\d+[\d.,]*)\s*(?:lira|tl|₺)/i)
  if (costMatch) {
    const raw = costMatch[1]!.replace(/\./g, '').replace(',', '.')
    result.cost = parseFloat(raw) || undefined
  }

  // 4. Endikasyon: "neden çürük", "endikasyon kronik pulpitis"
  const indicationMatch = lower.match(/(?:endikasyon|tanı|sebep|neden|teşhis)\s*[:\-–]?\s*([^,\.\n]{3,60})/i)
  if (indicationMatch) {
    result.indication = indicationMatch[1]!.trim()
  }

  // 5. İşlem adı: Bilinen işlemler listesinden eşleştirme
  const procedureKeywords = [
    'kanal tedavisi', 'dolgu', 'çekim', 'diş çekimi', 'kuron', 'köprü', 'implant',
    'ortodonti', 'diş temizliği', 'tartır temizliği', 'protez', 'kaplama',
    'kompozit', 'amalgam', 'inley', 'onlay', 'overlay', 'veneer', 'zirkonyum',
    'porselen', 'beyazlatma', 'bleaching', 'apeksifikasyon', 'rezeksiyon',
    'kistektomi', 'alveoloplasti', 'gingival tedavi', 'periodontoloji', 'kök hücre', 'flor'
  ]

  for (const kw of procedureKeywords) {
    if (lower.includes(kw)) {
      result.procedureName = kw.charAt(0).toUpperCase() + kw.slice(1)
      break
    }
  }

  // İşlem bulunamadıysa cümlenin başından anlam çıkarmaya çalış (temizlenmiş hali)
  if (!result.procedureName && text.trim()) {
    let cleaned = text
      .replace(/\d+\s*(?:numaralı\s*)?diş(?:\s*no\.?)?/gi, '')
      .replace(/(?:ücret|fiyat|tutar)\s*:?\s*\d[\d.,]*\s*(?:lira|tl|₺)?/gi, '')
      .replace(/(?:endikasyon|tanı|sebep|neden|teşhis)\s*:?\s*[^,.\n]*/gi, '')
      .replace(/(?:hey asistan|asistan|siri)/gi, '')
      .replace(/(?:ekle|kaydet|yap|uygula)/gi, '')
      .trim()
    
    if (cleaned.length > 2) {
      result.procedureName = cleaned.split(/[,.\n]/)[0]?.trim() || cleaned
    }
  }

  // Grup adı
  const groupMatch = lower.match(/(?:grup(?:\s*adı)?|gruba\s*ekle|plan(?:\s*adı)?)\s*[:\-–]?\s*([^,\.\n]{3,50})/i)
  if (groupMatch) result.groupName = groupMatch[1]!.trim()

  return result
}

// ── AI Parser ───────────────────────────────────────────────────────────────
export async function parseTreatmentsAI(text: string, procNames: string[] = [], indNames: string[] = [], diseaseNames: string[] = [], consultationNames: string[] = []): Promise<AIParsedData> {
  try {
    const res = await fetch('/api/ai/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, procNames, indNames, diseaseNames, consultationNames })
    })
    
    if (!res.ok) {
      console.error('AI Parse API Error:', await res.text())
      return {}
    }
    
    const data = await res.json()
    if (data.result) {
      console.log('🤖 [AI Parse Sonucu]:', data.result)
      return data.result as AIParsedData
    }
    return {}
  } catch (err) {
    console.error('AI Parse request failed:', err)
    return {}
  }
}

// ── Text-to-Speech Helper ────────────────────────────────────────────────
export function speakText(text: string) {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel() // Varsa devam eden konuşmayı durdur
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'tr-TR'
    utterance.rate = 1.0
    utterance.pitch = 1.0
    window.speechSynthesis.speak(utterance)
  }
}

// ── VoiceInputButton Component ─────────────────────────────────────────────
interface VoiceInputButtonProps {
  onTranscript: (text: string) => void
  size?: 'sm' | 'md'
  label?: string
  continuous?: boolean
}

export function VoiceInputButton({ onTranscript, size = 'md', label, continuous = false }: VoiceInputButtonProps) {
  const { isListening, transcript, interimTranscript, error, supported, start, stop, reset } = useVoiceInput('tr-TR', continuous)
  
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript

  useEffect(() => {
    // Transcript doluysa ve beklememiz gereken bir durum yoksa
    if (transcript) {
      if (!continuous && isListening) return; // Normal modda konuşma bitene kadar bekle
      
      const lower = transcript.toLowerCase()
      // Siri kapatma / durdurma komutları
      if (/(?:siri|asistan).*?(?:kapat|kapan|dur|durdur)/i.test(lower) || /(?:dinlemeyi durdur|sesimi kapat)/i.test(lower)) {
        console.log('🛑 [VoiceInput] Asistan sesli komutla kapatıldı.')
        stop()
        reset()
        return
      }

      console.log('🗣️ [VoiceInput] Söylenen metin (işlenmek üzere API\'ye gidiyor):', transcript)
      onTranscriptRef.current(transcript)
      reset() // İşledikten sonra sıfırla ki döngüye girmesin
    }
  }, [isListening, transcript, continuous, reset])

  if (!supported) return null

  const isSm = size === 'sm'

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6, position: 'relative' }}>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes siriWave {
          0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4), 0 0 0 0 rgba(236, 72, 153, 0.4); }
          50% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0), 0 0 0 20px rgba(236, 72, 153, 0); }
          100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0), 0 0 0 0 rgba(236, 72, 153, 0); }
        }
        @keyframes siriGradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}} />
      
      <button
        type="button"
        onClick={isListening ? stop : start}
        title={isListening ? (continuous ? 'Asistanı Kapat' : 'Dinlemeyi durdur') : (continuous ? 'Siri Modu (Sürekli Dinler)' : 'Sesle doldur')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: isSm ? '6px 12px' : '8px 16px',
          borderRadius: 30,
          border: isListening ? 'none' : '1px solid var(--glass-border)',
          backgroundImage: isListening 
            ? 'linear-gradient(270deg, #3b82f6, #ec4899, #8b5cf6)' 
            : 'none',
          backgroundColor: isListening ? 'transparent' : 'var(--glass-bg)',
          backgroundSize: '200% 200%',
          color: isListening ? '#ffffff' : 'var(--foreground-2)',
          cursor: 'pointer',
          fontSize: isSm ? 11 : 13,
          fontWeight: isListening ? 600 : 500,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          animation: isListening ? 'siriGradient 3s ease infinite, siriWave 1.5s infinite' : 'none',
          boxShadow: isListening ? '0 4px 15px rgba(236, 72, 153, 0.4)' : 'none',
          position: 'relative',
          overflow: 'hidden',
          zIndex: 10,
        }}
      >
        <span style={{ fontSize: isSm ? 14 : 18 }}>
          {isListening ? '🎙️' : '🎤'}
        </span>
        {label && <span>{continuous ? (isListening ? 'Asistan Dinliyor...' : 'Asistanı Başlat') : label}</span>}
      </button>

      {/* Floating Transcript Feedback when in continuous mode and listening */}
      {isListening && continuous && (interimTranscript || transcript) && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 12px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--card-bg, #0f172a)',
          border: '1px solid var(--input-border, #334155)',
          borderRadius: 12,
          padding: '8px 14px',
          width: 'max-content',
          maxWidth: 300,
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--foreground)',
          zIndex: 999,
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          animation: 'fadeIn 0.2s ease-out',
        }}>
          <div style={{ fontSize: 10, color: '#3b82f6', marginBottom: 4, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
            Asistan Duyuyor
          </div>
          <div>{transcript} <span style={{ opacity: 0.6 }}>{interimTranscript}</span></div>
        </div>
      )}

      {error && !isListening && (
        <span style={{ fontSize: 10, color: 'var(--danger)', marginTop: 4 }}>{error}</span>
      )}
    </div>
  )
}

