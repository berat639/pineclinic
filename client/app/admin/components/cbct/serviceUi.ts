/**
 * ============================================================================
 * YEREL SERVİS DURUMU, HASTA META KARTI VE ANLIK TOOLTIP YÖNETİCİSİ (cbct/serviceUi.ts)
 * ============================================================================
 * Bu modül aşağıdaki arayüz bileşenlerini yönetir:
 * 1. Üst bardaki "Local Service" durum ışığı, açılır bilgi kartı (#service-popover),
 *    "Servisi Aç" (pineclinic://start) özel protokol tetikleyicisi ve Mac Gatekeeper rehberi.
 * 2. Üst bardaki Hasta & Çekim Bilgileri profil ikonu (#btn-patient-meta) ve açılır
 *    DICOM meta veri kartı (#patient-popover). Meyer, KaVo ve NewTom CBCT etiketlerini
 *    hekimlerin anlayacağı klinik birimlerle gösterir; veri yoksa "—" yazar.
 * 3. Tüm 19 ikon/buton ve meta veri satırları üzerinde gecikmesiz çalışan tek cümlelik
 *    modern Türkçe bilgi balonu (Tooltip) sistemi (`initTooltips`).
 * ============================================================================
 */
import { getActiveApiBase, type ServiceLink } from './service';
import { formatDisplayPatientName } from './turkishNameSplitter';
import { formatDicomDateWithDayjs, type DicomMeta } from './volume';

const $ = <T extends HTMLElement>(id: string, root: ParentNode = document) =>
  (root.querySelector(`#${id}`) ?? document.getElementById(id)) as T;

export const isDemo = (): boolean =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo');

export type ClientOs = 'windows' | 'mac' | 'other';

/**
 * Kullanıcının işletim sistemini (`windows`, `mac` veya `other`) tespit eder.
 */
export function detectClientOs(): ClientOs {
  if (typeof navigator === 'undefined') return 'mac';
  const uaDataPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || '';
  const raw = `${uaDataPlatform} ${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();
  if (raw.includes('win')) return 'windows';
  if (raw.includes('mac') || raw.includes('darwin')) return 'mac';
  return 'other';
}

export const CONN_LABEL = {
  offline: 'Servis kapalı',
  connecting: 'Yeniden bağlanıyor…',
  online: 'Çalışıyor',
  stopping: 'Durduruluyor…',
  incompatible: 'Sürüm uyumsuz',
} as const;

export const CONN_HINT = {
  offline: 'Servis kapalı. PineClinic Lokal Servisler uygulamasını açıp Başlat düğmesine basın.',
  connecting: 'Servise yeniden bağlanılıyor…',
  online: '',
  stopping: 'Servis durduruluyor…',
  incompatible: 'Servis sürümü bu görüntüleyiciyle uyumsuz. Lokal Servisler uygulamasını güncelleyin.',
} as const;

const INSTALLED_KEY = 'pineclinic.service.installed';
const MAC_DOWNLOAD_URL = process.env.NEXT_PUBLIC_CBCT_DOWNLOAD_URL || '/downloads/PineClinic-Lokal-Servisler.dmg';
const WIN_DOWNLOAD_URL = process.env.NEXT_PUBLIC_CBCT_WIN_DOWNLOAD_URL || '/downloads/PineClinic-Lokal-Servisler-Setup.exe';
const LAUNCH_URL = 'pineclinic://start';

export function getDownloadUrl(os: ClientOs = detectClientOs()): string {
  return os === 'windows' ? WIN_DOWNLOAD_URL : MAC_DOWNLOAD_URL;
}

const isInstalled = (): boolean => {
  try {
    const val = localStorage.getItem(INSTALLED_KEY);
    if (val !== null) return val === '1';
  } catch { /* ignore storage errors */ }
  return true;
};

/**
 * Mac Gatekeeper güvenlik rehberi modalını açar/kapatır.
 */
export function openMacGuide(root: ParentNode = document): void {
  const modal = $('modal-mac-guide', root);
  const closeBtn = $('btn-mac-guide-close', root);
  if (!modal) return;
  modal.hidden = false;
  closeBtn?.focus();
}

export function closeMacGuide(root: ParentNode = document): void {
  const modal = $('modal-mac-guide', root);
  if (modal) modal.hidden = true;
}

/**
 * Windows Kurulum & SmartScreen rehberi modalını açar/kapatır.
 */
export function openWinGuide(root: ParentNode = document): void {
  const modal = $('modal-win-guide', root);
  const closeBtn = $('btn-win-guide-close', root);
  if (!modal) {
    openMacGuide(root);
    return;
  }
  modal.hidden = false;
  closeBtn?.focus();
}

export function closeWinGuide(root: ParentNode = document): void {
  const modal = $('modal-win-guide', root);
  if (modal) modal.hidden = true;
}

/**
 * İşletim sistemine göre uygun kurulum rehberi modalını açar.
 */
export function openInstallGuide(root: ParentNode = document): void {
  if (detectClientOs() === 'windows') {
    openWinGuide(root);
  } else {
    openMacGuide(root);
  }
}

/**
 * Yerel servis durum ışığını (#service-dot), açılır bilgi kartını (#service-popover)
 * ve başlangıç ekranındaki aksiyon butonlarını günceller.
 */
export function createServiceUiController(
  link: ServiceLink,
  toast: (text: string, kind?: 'info' | 'warn' | 'error' | 'ok', ms?: number) => void,
  root: ParentNode = document,
) {
  let launching = false;
  let launchFailed = false;
  let launchTimer = 0;

  const macGuideModal = $('modal-mac-guide', root);
  const btnMacGuideClose = $('btn-mac-guide-close', root);
  const winGuideModal = $('modal-win-guide', root);
  const btnWinGuideClose = $('btn-win-guide-close', root);
  const listenerAbort = new AbortController();
  const { signal } = listenerAbort;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (macGuideModal && !macGuideModal.hidden) {
        event.stopPropagation();
        closeMacGuide(root);
      }
      if (winGuideModal && !winGuideModal.hidden) {
        event.stopPropagation();
        closeWinGuide(root);
      }
    }
  };

  if (btnMacGuideClose && macGuideModal) {
    btnMacGuideClose.onclick = () => closeMacGuide(root);
    macGuideModal.addEventListener('click', (event) => {
      if (event.target === macGuideModal) closeMacGuide(root);
    }, { signal });
  }
  if (btnWinGuideClose && winGuideModal) {
    btnWinGuideClose.onclick = () => closeWinGuide(root);
    winGuideModal.addEventListener('click', (event) => {
      if (event.target === winGuideModal) closeWinGuide(root);
    }, { signal });
  }
  window.addEventListener('keydown', onKeyDown, { signal });

  function cancelLaunch(): void {
    launching = false;
    window.clearTimeout(launchTimer);
    updateServiceUi();
  }

  function launchLocalService(): void {
    launching = true;
    launchFailed = false;
    updateServiceUi();
    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    frame.src = LAUNCH_URL;
    document.body.appendChild(frame);
    window.setTimeout(() => frame.remove(), 3000);
    window.clearTimeout(launchTimer);
    launchTimer = window.setTimeout(() => {
      if (link.state === 'online') return;
      launching = false;
      toast('Servis henüz bağlanmadı. Tarayıcı uyarısından "Aç"ı onayladığınızdan emin olun veya tekrar deneyin.', 'warn', 7000);
      updateServiceUi();
    }, 10000);
  }

  function downloadLocalService(): void {
    const os = detectClientOs();
    window.open(getDownloadUrl(os), '_blank', 'noopener');
    openInstallGuide(root);
    toast(
      os === 'windows'
        ? 'Windows kurulum paketi (.exe) indiriliyor. Kurulum adımları için ekrandaki rehberi inceleyin.'
        : 'macOS kurulum paketi (.dmg) indiriliyor. Kurulum ve ilk açılış için ekrandaki rehberi inceleyin.',
      'info',
      9000,
    );
  }

  function renderServiceCta(state: typeof link.state): void {
    const demo = isDemo();
    const show = state !== 'online' && !demo;
    const installed = isInstalled() && !launchFailed;
    const clientOs = detectClientOs();
    root.querySelectorAll<HTMLElement>('[data-svc-cta]').forEach((box) => {
      box.hidden = !show;
      if (!show) return;
      const primary = box.querySelector<HTMLButtonElement>('[data-svc=primary]')!;
      const alt = box.querySelector<HTMLButtonElement>('[data-svc=alt]')!;
      const note = box.querySelector<HTMLElement>('[data-svc=note]')!;
      const macGuide = box.querySelector<HTMLButtonElement>('[data-svc=macguide]');
      if (macGuide) {
        macGuide.textContent = clientOs === 'windows'
          ? 'Windows Kurulum & SmartScreen Rehberi'
          : 'Mac Kurulum & Güvenlik İzni Rehberi';
        macGuide.onclick = () => openInstallGuide(root);
        macGuide.hidden = false;
      }
      if (state === 'incompatible') {
        primary.textContent = 'Servisi Güncelle';
        primary.onclick = downloadLocalService;
        primary.disabled = false;
        alt.hidden = true;
        note.textContent = 'Kurulu servis sürümü bu görüntüleyiciyle uyumsuz.';
      } else if (installed) {
        if (launching) {
          primary.textContent = 'Tekrar Gönder';
          primary.disabled = false;
          primary.onclick = () => launchLocalService();
          alt.hidden = false;
          alt.textContent = 'Vazgeç';
          alt.onclick = () => cancelLaunch();
          note.textContent = 'Tarayıcı bildiriminde "PineClinic Lokal Servisler adlı uygulamayı aç" seçeneğine tıklayın.';
        } else {
          primary.textContent = 'Servisi Aç';
          primary.disabled = state === 'stopping';
          primary.onclick = launchLocalService;
          alt.hidden = false;
          alt.textContent = clientOs === 'windows' ? 'Kurulu değil mi? Windows Setup İndir' : 'Kurulu değil mi? İndir ve Kur';
          alt.onclick = () => {
            try { localStorage.setItem(INSTALLED_KEY, '0'); } catch { /* ignore */ }
            cancelLaunch();
            downloadLocalService();
          };
          note.textContent = 'Servis kapalı. Buton masaüstü uygulamasını otomatik başlatır.';
        }
      } else {
        primary.textContent = clientOs === 'windows' ? 'Windows Setup (.exe) İndir ve Kur' : 'Servisi İndir ve Kur';
        primary.onclick = downloadLocalService;
        primary.disabled = false;
        alt.hidden = false;
        alt.textContent = 'Zaten kurulu mu? Servisi Aç';
        alt.onclick = () => {
          try { localStorage.setItem(INSTALLED_KEY, '1'); } catch { /* ignore */ }
          launchLocalService();
        };
        alt.disabled = false;
        note.textContent = 'PineClinic Lokal Servisler bulunamadı. Önce indirip kurun.';
      }
    });
  }

  function updateServiceUi(): void {
    const state = link.state;
    const dot = $('service-dot', root);
    if (!dot) return;
    dot.dataset.state = state;
    $('sp-state', root).textContent = CONN_LABEL[state];
    $('sp-address', root).textContent = getActiveApiBase().replace('http://', '');
    $('sp-engine', root).textContent = state === 'online' ? (link.provider && link.provider !== 'none' ? link.provider : 'AI motoru yok') : '—';
    $('sp-started', root).textContent = state === 'online' && link.startedAt ? new Date(link.startedAt * 1000).toLocaleTimeString() : '—';
    $('sp-manager', root).textContent = state === 'online' ? `${link.viewers} görüntüleyici bağlı` : '—';
    const usable = state === 'online';
    const demo = isDemo();
    const btnLoad = $<HTMLButtonElement>('btn-load', root);
    btnLoad.hidden = !usable && !demo;
    btnLoad.disabled = !usable && !demo;
    $('btn-load-empty', root).hidden = !usable && !demo;
    $('empty-hint', root).textContent = '';
    if (usable) {
      try { localStorage.setItem(INSTALLED_KEY, '1'); } catch { /* ignore */ }
      launching = false;
      launchFailed = false;
    }

    const emptyTitle = $('empty-title', root);
    const emptyDesc = $('empty-desc', root);
    if (usable || demo) {
      emptyTitle.textContent = 'Başlamak için bir DICOM serisi seçin';
      emptyDesc.textContent = 'Seri klasörünü seçin ya da buraya sürükleyin. Panoramik, kesitler ve 3D görünüm AI segmentasyonu tamamlanınca birlikte açılır.';
    } else {
      const installed = isInstalled() && !launchFailed;
      if (installed) {
        emptyTitle.textContent = 'Lokal Servis Kapalı';
        emptyDesc.textContent = 'DICOM verilerini işlemek ve AI analizi yapabilmek için bilgisayarınızdaki servisi başlatın.';
      } else {
        emptyTitle.textContent = 'PineClinic Lokal Servisler Gerekli';
        emptyDesc.textContent = 'Görüntüleme ve AI modelleri yerel bilgisayarınızda çalışır. Başlamak için uygulamayı indirin ve kurun.';
      }
    }

    renderServiceCta(state);
  }

  function dispose(): void {
    window.clearTimeout(launchTimer);
    listenerAbort.abort();
  }

  return { updateServiceUi, dispose };
}

/**
 * Üst bardaki Hasta & Çekim Bilgileri (#patient-popover) kartını günceller.
 * Meyer, KaVo ve NewTom CBCT etiketlerinden gelen verileri doldurur;
 * bilgi yoksa veya vaka kapatılmışsa tüm alanlara "—" yazar.
 */
export function updatePatientMetaUi(meta?: DicomMeta, root: ParentNode = document): void {
  const val = (v?: string): string => {
    const t = (v ?? '').trim();
    return t && t !== '—' ? t : '—';
  };
  const set = (id: string, text: string) => {
    const el = $(id, root);
    if (el) el.textContent = text;
  };

  if (!meta) {
    set('pm-name', '—');
    set('pm-id', '—');
    set('pm-birth', '—');
    set('pm-sex', '—');
    set('pm-date', '—');
    set('pm-device', '—');
    set('pm-clinic', '—');
    set('pm-exposure', '—');
    set('pm-dose', '—');
    set('pm-fov', '—');
    set('pm-res', '—');
    return;
  }

  const birthFormatted = val(meta.birthDate) === '—'
    ? '—'
    : (/\d{8}/.test(meta.birthDate) ? formatDicomDateWithDayjs(meta.birthDate) : meta.birthDate);
  const studyFormatted = val(meta.studyDate) === '—'
    ? '—'
    : (/^\d{6,8}$/.test(meta.studyDate) ? formatDicomDateWithDayjs(meta.studyDate) : meta.studyDate);

  set('pm-name', formatDisplayPatientName(meta.patientName));
  set('pm-id', val(meta.patientId));
  set('pm-birth', birthFormatted);
  set('pm-sex', val(meta.sex));
  set('pm-date', studyFormatted);
  set('pm-device', val(meta.device));
  set('pm-clinic', val(meta.clinic));
  set('pm-exposure', val(meta.exposure));
  set('pm-dose', val(meta.dose));
  set('pm-fov', val(meta.fov));
  set('pm-res', val(meta.resolution));
}

/**
 * Sayfadaki tüm `[data-tip]` özniteliğine sahip buton, ikon ve meta veri satırları
 * için gecikmesiz çalışan tek cümlelik Türkçe bilgi balonu (tooltip) yöneticisi.
 */
export function initTooltips(container?: HTMLElement): () => void {
  const host = container ?? document.body;
  let bubble = host.querySelector('#ui-tooltip') as HTMLDivElement | null;
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.id = 'ui-tooltip';
    bubble.className = 'ui-tooltip';
    bubble.hidden = true;
    host.appendChild(bubble);
  }

  let activeTarget: HTMLElement | null = null;

  const positionBubble = (target: HTMLElement) => {
    if (!bubble || bubble.hidden) return;
    const rect = target.getBoundingClientRect();
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    const pad = 8;

    let left = rect.left + rect.width / 2 - bw / 2;
    let top = rect.bottom + pad;

    // Sol araç çubuğundaki (.tools / [data-tools-bar]) ikonlar için balonu sağ tarafa aç
    if (target.closest('.tools, [data-tools-bar]')) {
      left = rect.right + pad;
      top = rect.top + rect.height / 2 - bh / 2;
    } else if (target.closest('#patient-popover')) {
      // Hasta meta kartı satırları için balonu satırın üstüne veya soluna hizala
      left = Math.max(pad, rect.left - bw - pad);
      if (left < pad + 10) {
        left = Math.max(pad, Math.min(rect.left, window.innerWidth - bw - pad));
        top = Math.max(pad, rect.top - bh - 6);
      } else {
        top = rect.top + rect.height / 2 - bh / 2;
      }
    }

    if (left + bw > window.innerWidth - pad) left = window.innerWidth - bw - pad;
    if (left < pad) left = pad;
    if (top + bh > window.innerHeight - pad) top = Math.max(pad, rect.top - bh - pad);
    if (top < pad) top = pad;

    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.top = `${Math.round(top)}px`;
  };

  const onMouseOver = (event: MouseEvent) => {
    const target = (event.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
    if (!target || !bubble) {
      if (bubble) bubble.hidden = true;
      activeTarget = null;
      return;
    }
    const text = target.getAttribute('data-tip')?.trim();
    if (!text) {
      bubble.hidden = true;
      activeTarget = null;
      return;
    }
    activeTarget = target;
    bubble.textContent = text;
    bubble.hidden = false;
    positionBubble(target);
  };

  const onMouseOut = (event: MouseEvent) => {
    if (!activeTarget || !bubble) return;
    const related = event.relatedTarget as Node | null;
    if (related && activeTarget.contains(related)) return;
    bubble.hidden = true;
    activeTarget = null;
  };

  const onHide = () => {
    if (bubble) bubble.hidden = true;
  };

  document.addEventListener('mouseover', onMouseOver);
  document.addEventListener('mouseout', onMouseOut);
  window.addEventListener('scroll', onHide, true);
  window.addEventListener('mousedown', onHide);

  return () => {
    document.removeEventListener('mouseover', onMouseOver);
    document.removeEventListener('mouseout', onMouseOut);
    window.removeEventListener('scroll', onHide, true);
    window.removeEventListener('mousedown', onHide);
    bubble?.remove();
  };
}
