/**
 * ============================================================================
 * KADEMELİ VAKA YÜKLEME EKRANI (src/loading.ts)
 * ============================================================================
 * DICOM okuma, hacim aktarımı, AI segmentasyonu ve görünümlerin hazırlanması
 * aşamalarını gerçek zamanlı ilerleme çubuğu ile gösterir. Yalnızca tüm hesaplamalar
 * (AI + 17 noktalı ark + 3B görünüm) tamamlandığında `hide()` ile kapanır.
 * ============================================================================
 */
export type StageId = 'read' | 'transfer' | 'ai' | 'build';
type StageState = 'pending' | 'active' | 'done' | 'skipped' | 'error';

const LABELS: Record<StageId, string> = {
  read: 'DICOM serisi okunuyor',
  transfer: 'Hacim aktarılıyor',
  ai: 'AI segmentasyonu (alt çene)',
  build: 'Görünümler hazırlanıyor',
};
const ORDER: StageId[] = ['read', 'transfer', 'ai', 'build'];

export class LoadingOverlay {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly cancelButton: HTMLButtonElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly closeTopButton: HTMLButtonElement;
  private cancelHandler: () => void = () => undefined;
  private retryHandler: () => void = () => undefined;
  private closeHandler: () => void = () => undefined;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <div class="loading-card">
        <button type="button" class="loading-close-top" id="loading-close-top" aria-label="Görüntüleyiciyi Kapat" title="Görüntüleyiciyi kapatıp tedavi planlamaya döner">✕</button>
        <div class="loading-logo" aria-hidden="true">◖◗</div>
        <h2 id="loading-title">Vaka hazırlanıyor</h2>
        <ol class="loading-stages" id="loading-stages"></ol>
        <p class="loading-notice" id="loading-notice"></p>
        <div class="loading-actions">
          <button type="button" class="btn primary" id="loading-retry" hidden>Tekrar dene</button>
          <button type="button" class="btn" id="loading-cancel">İptal</button>
          <button type="button" class="btn btn-close-modal" id="loading-close">✕ Kapat</button>
        </div>
      </div>`;
    this.list = root.querySelector('#loading-stages')!;
    this.notice = root.querySelector('#loading-notice')!;
    this.cancelButton = root.querySelector('#loading-cancel')!;
    this.retryButton = root.querySelector('#loading-retry')!;
    this.closeButton = root.querySelector('#loading-close')!;
    this.closeTopButton = root.querySelector('#loading-close-top')!;
    this.cancelButton.onclick = () => this.cancelHandler();
    this.retryButton.onclick = () => this.retryHandler();
    this.closeButton.onclick = () => this.closeHandler();
    this.closeTopButton.onclick = () => this.closeHandler();
    this.reset();
  }

  onCancel(handler: () => void) { this.cancelHandler = handler; }
  onRetry(handler: () => void) { this.retryHandler = handler; }
  onClose(handler: () => void) { this.closeHandler = handler; }

  private reset() {
    this.list.innerHTML = ORDER.map((id) => `
      <li data-stage="${id}" data-state="pending">
        <span class="stage-icon"></span>
        <div class="stage-body"><span class="stage-label">${LABELS[id]}</span><span class="stage-detail"></span>
          <div class="stage-bar"><i style="width:0%"></i></div></div>
      </li>`).join('');
    this.notice.textContent = '';
    this.retryButton.hidden = true; this.cancelButton.hidden = false;
  }

  show() { this.reset(); this.root.hidden = false; }
  hide() { this.root.hidden = true; }
  get visible() { return !this.root.hidden; }

  stage(id: StageId, state: StageState, progress?: number, detail?: string) {
    const item = this.list.querySelector<HTMLElement>(`[data-stage="${id}"]`);
    if (!item) return;
    item.dataset.state = state;
    if (state === 'done' || state === 'skipped') progress = 1;
    if (progress !== undefined) item.querySelector<HTMLElement>('.stage-bar i')!.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
    if (detail !== undefined) item.querySelector('.stage-detail')!.textContent = detail;
  }

  message(text: string) { this.notice.textContent = text; }

  /** Show an unrecoverable problem with Retry/Cancel instead of silently closing. */
  fail(id: StageId, text: string) {
    this.stage(id, 'error', undefined, text);
    this.notice.textContent = text;
    this.retryButton.hidden = false;
  }
}
