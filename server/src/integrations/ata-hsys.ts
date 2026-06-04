// ATA Hsys — Integration API client (servis.ataotomotiv.com)
//
// Doğrulama: POST /token → kısa süreli Bearer JWT
// Randevu  : POST /randevu, PATCH /randevu?id=...
// Geçmiş   : GET /gecmis-randevular?telefon=... | musteri_id=... | plaka=...
//
// Tüm fonksiyonlar env yoksa veya hata olursa { success: false } döner. Hiçbiri
// kritik bağımlılık değil; randevuOlustur gibi yan-etki olarak çağrılır.

const TOKEN_TTL_MS = 55 * 60 * 1000 // 55 dakika; gerçek JWT exp bilinmediği için güvenli pay

let cachedToken: { value: string; expiresAt: number } | null = null

function getConfig(): { baseUrl: string; appKey: string; appSecret: string } | null {
  const baseUrl = (process.env.ATA_HSYS_BASE_URL || '').trim().replace(/\/+$/, '')
  const appKey = (process.env.ATA_HSYS_APP_KEY || '').trim()
  const appSecret = (process.env.ATA_HSYS_APP_SECRET || '').trim()
  if (!baseUrl || !appKey || !appSecret) return null
  return { baseUrl, appKey, appSecret }
}

/** +90 / 0 / boşluk / tire vb. temizleyip 10 haneli GSM string'i üretir. */
export function normalizeTelefon(input: string): string {
  let digits = (input || '').replace(/\D/g, '')
  if (digits.startsWith('90') && digits.length > 10) digits = digits.slice(2)
  if (digits.startsWith('0') && digits.length > 10) digits = digits.slice(1)
  return digits.slice(-10)
}

async function fetchToken(): Promise<string | null> {
  const cfg = getConfig()
  if (!cfg) return null
  try {
    const res = await fetch(`${cfg.baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_key: cfg.appKey, app_secret: cfg.appSecret }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[ATA] /token HTTP ${res.status}: ${body.slice(0, 200)}`)
      return null
    }
    const data = (await res.json()) as { access_token?: string; token?: string }
    const token = data.access_token || data.token || null
    if (!token) {
      console.error('[ATA] /token yanıtında access_token yok')
      return null
    }
    cachedToken = { value: token, expiresAt: Date.now() + TOKEN_TTL_MS }
    return token
  } catch (err) {
    console.error('[ATA] /token hatası:', err)
    return null
  }
}

async function getToken(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value
  }
  return fetchToken()
}

/** 401 dönerse token'ı yenileyip 1 kez retry eden fetch sarmalayıcı. */
async function authFetch(
  path: string,
  init: RequestInit,
): Promise<Response | null> {
  const cfg = getConfig()
  if (!cfg) return null
  let token = await getToken()
  if (!token) return null

  const doRequest = (t: string) =>
    fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${t}`,
      },
    })

  let res = await doRequest(token)
  if (res.status === 401) {
    cachedToken = null
    token = await getToken(true)
    if (!token) return res
    res = await doRequest(token)
  }
  return res
}

// ── Public types ─────────────────────────────────────────────────────────────

export type AtaAppointmentInput = {
  date: string          // YYYY-MM-DD
  time: string          // HH:MM
  telefon: string       // herhangi formatta; içeride normalize edilir
  ad_soyad?: string
  plaka?: string
  arac: string
  musteriistegi: string
  danisman_id?: number
  irtibat?: string
  fiyat_teklifi?: string
  kampanya?: string
  gorusme_notu?: string
}

export type AtaAppointmentResult =
  | { success: true; id: number; duplicate: boolean }
  | { success: false; reason: string }

export type AtaPatchInput = {
  date?: string
  time?: string
  randevu_durumu?: string
  gorusme_notu?: string
  danisman_id?: number
}

export type AtaHistoryItem = {
  id: number
  date?: string
  time?: string
  arac?: string
  plaka?: string
  musteriistegi?: string
  randevu_durumu?: string
}

export type AtaHistoryResult =
  | { success: true; appointments: AtaHistoryItem[] }
  | { success: false; reason: string }

// ── Public API ───────────────────────────────────────────────────────────────

export function isAtaConfigured(): boolean {
  return getConfig() !== null
}

export async function createAtaHsysAppointment(
  input: AtaAppointmentInput,
): Promise<AtaAppointmentResult> {
  if (!isAtaConfigured()) return { success: false, reason: 'ATA Hsys env yok' }

  const body = {
    ...input,
    telefon: normalizeTelefon(input.telefon),
  }

  try {
    const res = await authFetch('/randevu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res) return { success: false, reason: 'auth fetch null' }

    const text = await res.text()
    let json: any = null
    try { json = text ? JSON.parse(text) : null } catch {}

    if (res.status !== 200 && res.status !== 201) {
      console.error(`[ATA] POST /randevu HTTP ${res.status}: ${text.slice(0, 300)}`)
      return { success: false, reason: `HTTP ${res.status}` }
    }

    const id: number | undefined =
      json?.id ?? json?.randevu_id ?? json?.data?.id ?? json?.data?.randevu_id
    if (typeof id !== 'number') {
      console.error('[ATA] POST /randevu yanıtında id yok:', text.slice(0, 200))
      return { success: false, reason: 'id alanı bulunamadı' }
    }

    return { success: true, id, duplicate: res.status === 200 }
  } catch (err) {
    console.error('[ATA] POST /randevu hatası:', err)
    return { success: false, reason: 'network error' }
  }
}

export async function updateAtaHsysAppointment(
  id: number | string,
  patch: AtaPatchInput,
): Promise<AtaAppointmentResult> {
  if (!isAtaConfigured()) return { success: false, reason: 'ATA Hsys env yok' }

  const idNum = typeof id === 'string' ? parseInt(id, 10) : id
  if (!Number.isFinite(idNum)) return { success: false, reason: 'geçersiz id' }

  try {
    const res = await authFetch(`/randevu?id=${encodeURIComponent(String(idNum))}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res) return { success: false, reason: 'auth fetch null' }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[ATA] PATCH /randevu HTTP ${res.status}: ${text.slice(0, 300)}`)
      return { success: false, reason: `HTTP ${res.status}` }
    }

    return { success: true, id: idNum, duplicate: false }
  } catch (err) {
    console.error('[ATA] PATCH /randevu hatası:', err)
    return { success: false, reason: 'network error' }
  }
}

export async function getCustomerHistory(params: {
  telefon?: string
  musteri_id?: number
  plaka?: string
  mode?: 'customer' | 'plate' | 'both'
  before?: string
  limit?: number
}): Promise<AtaHistoryResult> {
  if (!isAtaConfigured()) return { success: false, reason: 'ATA Hsys env yok' }
  if (!params.telefon && !params.musteri_id && !params.plaka) {
    return { success: false, reason: 'telefon/musteri_id/plaka gerekli' }
  }

  const qs = new URLSearchParams()
  if (params.telefon) qs.set('telefon', normalizeTelefon(params.telefon))
  if (params.musteri_id) qs.set('musteri_id', String(params.musteri_id))
  if (params.plaka) qs.set('plaka', params.plaka)
  if (params.mode) qs.set('mode', params.mode)
  if (params.before) qs.set('before', params.before)
  qs.set('limit', String(Math.min(Math.max(params.limit ?? 5, 1), 20)))

  try {
    const res = await authFetch(`/gecmis-randevular?${qs.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (!res) return { success: false, reason: 'auth fetch null' }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[ATA] GET /gecmis-randevular HTTP ${res.status}: ${text.slice(0, 300)}`)
      return { success: false, reason: `HTTP ${res.status}` }
    }
    const data: any = await res.json().catch(() => null)
    const list: any[] = Array.isArray(data) ? data : data?.data ?? data?.items ?? []
    const appointments: AtaHistoryItem[] = list
      .map((r: any) => ({
        id: Number(r.id ?? r.randevu_id),
        date: r.date,
        time: r.time,
        arac: r.arac,
        plaka: r.plaka,
        musteriistegi: r.musteriistegi,
        randevu_durumu: r.randevu_durumu,
      }))
      .filter((r) => Number.isFinite(r.id))
    return { success: true, appointments }
  } catch (err) {
    console.error('[ATA] GET /gecmis-randevular hatası:', err)
    return { success: false, reason: 'network error' }
  }
}

// ── Randevu müsaitlik kontrolü ───────────────────────────────────────────────

export type AtaRandevuListItem = {
  id: number
  date?: string
  time?: string
  ad_soyad?: string
  telefon?: string
  arac?: string
  musteriistegi?: string
  randevu_durumu?: string
}

export type AtaRandevuListResult =
  | { success: true; appointments: AtaRandevuListItem[] }
  | { success: false; reason: string }

/**
 * GET /randevu — Belirli tarih veya tarih aralığındaki randevuları getirir.
 * Müsaitlik kontrolü için kullanılır.
 */
export async function getAppointmentsByDate(params: {
  date?: string       // YYYY-MM-DD (tek gün)
  from?: string       // YYYY-MM-DD (aralık başı)
  to?: string         // YYYY-MM-DD (aralık sonu)
  limit?: number
}): Promise<AtaRandevuListResult> {
  if (!isAtaConfigured()) return { success: false, reason: 'ATA Hsys env yok' }
  if (!params.date && !params.from) {
    return { success: false, reason: 'date veya from/to gerekli' }
  }

  const qs = new URLSearchParams()
  if (params.date) qs.set('date', params.date)
  if (params.from) qs.set('from', params.from)
  if (params.to) qs.set('to', params.to)
  qs.set('limit', String(Math.min(params.limit ?? 50, 100)))

  try {
    const res = await authFetch(`/randevu?${qs.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (!res) return { success: false, reason: 'auth fetch null' }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[ATA] GET /randevu HTTP ${res.status}: ${text.slice(0, 300)}`)
      return { success: false, reason: `HTTP ${res.status}` }
    }
    const data: any = await res.json().catch(() => null)
    const list: any[] = Array.isArray(data) ? data : data?.data ?? data?.items ?? []
    console.log(`[ATA] GET /randevu?${qs.toString()} → ${list.length} randevu`)
    const appointments: AtaRandevuListItem[] = list
      .map((r: any) => ({
        id: Number(r.id ?? r.randevu_id),
        date: r.date,
        time: r.time,
        ad_soyad: r.ad_soyad,
        telefon: r.telefon,
        arac: r.arac,
        musteriistegi: r.musteriistegi,
        randevu_durumu: r.randevu_durumu,
      }))
      .filter((r) => Number.isFinite(r.id))
    return { success: true, appointments }
  } catch (err) {
    console.error('[ATA] GET /randevu hatası:', err)
    return { success: false, reason: 'network error' }
  }
}

// ── Müşteri bilgisi sorgulama ────────────────────────────────────────────────

export type AtaCustomerInfo = {
  id?: number
  ad_soyad?: string
  telefon?: string
  plaka?: string
  arac?: string
  son_randevu?: {
    date?: string
    time?: string
    musteriistegi?: string
    randevu_durumu?: string
  }
}

export type AtaCustomerResult =
  | { success: true; customer: AtaCustomerInfo }
  | { success: false; reason: string }

/**
 * GET /musteri — Telefon numarasına göre müşteri bilgisi ve son randevu özeti.
 */
export async function getCustomerInfo(params: {
  telefon?: string
  id?: number
}): Promise<AtaCustomerResult> {
  if (!isAtaConfigured()) return { success: false, reason: 'ATA Hsys env yok' }
  if (!params.telefon && !params.id) {
    return { success: false, reason: 'telefon veya id gerekli' }
  }

  const qs = new URLSearchParams()
  if (params.telefon) qs.set('telefon', normalizeTelefon(params.telefon))
  if (params.id) qs.set('id', String(params.id))

  try {
    const res = await authFetch(`/musteri?${qs.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (!res) return { success: false, reason: 'auth fetch null' }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[ATA] GET /musteri HTTP ${res.status}: ${text.slice(0, 300)}`)
      return { success: false, reason: `HTTP ${res.status}` }
    }
    const data: any = await res.json().catch(() => null)
    if (!data) return { success: false, reason: 'Boş yanıt' }

    console.log(`[ATA] GET /musteri?${qs.toString()} → ${data.ad_soyad || 'anonim'}`)

    const customer: AtaCustomerInfo = {
      id: data.id ?? data.musteri_id,
      ad_soyad: data.ad_soyad ?? data.name ?? data.musteri_adi,
      telefon: data.telefon,
      plaka: data.plaka ?? data.son_plaka,
      arac: data.arac ?? data.son_arac,
      son_randevu: data.son_randevu ?? data.last_appointment ?? undefined,
    }
    return { success: true, customer }
  } catch (err) {
    console.error('[ATA] GET /musteri hatası:', err)
    return { success: false, reason: 'network error' }
  }
}
