import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDisplayPatientName } from './turkishNameSplitter';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, ((message: { data: string }) => void)[]>();
  url: string;
  constructor(url: string) { this.url = url; FakeEventSource.instances.push(this); }
  addEventListener(name: string, fn: (message: { data: string }) => void) { this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]); }
  close() { this.closed = true; }
  emit(name: string, data: object) { for (const fn of this.listeners.get(name) ?? []) fn({ data: JSON.stringify(data) }); }
  static get last() { return FakeEventSource.instances[FakeEventSource.instances.length - 1]; }
}

const hello = (instanceId: string, apiVersion = 3) => ({ instanceId, apiVersion, engine: 'onnx', provider: 'CPU', startedAt: 1, clients: { viewers: 1 }, datasets: [], jobs: [] });

async function freshLink() {
  vi.resetModules();
  const { ServiceLink } = await import('./service');
  return new ServiceLink();
}

describe('ServiceLink', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.stubGlobal('window', globalThis);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('goes online on hello and exposes the service identity', async () => {
    const link = await freshLink(); link.connect();
    FakeEventSource.last.emit('hello', hello('a'));
    expect(link.state).toBe('online');
    expect(link.instanceId).toBe('a');
    expect(link.provider).toBe('CPU');
  });

  it('treats a missing heartbeat as lost and reconnects with backoff', async () => {
    const link = await freshLink(); link.connect();
    FakeEventSource.last.emit('hello', hello('a'));
    vi.advanceTimersByTime(6100);
    expect(link.state).toBe('connecting');
    expect(FakeEventSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(600);
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('stays offline (not connecting) if the service was never reachable', async () => {
    const link = await freshLink(); link.connect();
    FakeEventSource.last.onerror?.();
    expect(link.state).toBe('offline');
  });

  it('reports a restart when the instanceId changes after being online', async () => {
    const link = await freshLink(); link.connect();
    const restarted = vi.fn(); link.addEventListener('restarted', restarted);
    FakeEventSource.last.emit('hello', hello('a'));
    FakeEventSource.last.onerror?.(); vi.advanceTimersByTime(600);
    FakeEventSource.last.emit('hello', hello('a'));
    expect(restarted).not.toHaveBeenCalled();
    FakeEventSource.last.onerror?.(); vi.advanceTimersByTime(1100);
    FakeEventSource.last.emit('hello', hello('b'));
    expect(restarted).toHaveBeenCalledTimes(1);
  });

  it('flags an incompatible API version and stops reconnecting', async () => {
    const link = await freshLink(); link.connect();
    FakeEventSource.last.emit('hello', hello('a', 1));
    expect(link.state).toBe('incompatible');
    vi.advanceTimersByTime(20000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('moves to stopping on service.stopping and then offline when the stream closes', async () => {
    const link = await freshLink(); link.connect();
    FakeEventSource.last.emit('hello', hello('a'));
    FakeEventSource.last.emit('service.stopping', { reason: 'user' });
    expect(link.state).toBe('stopping');
    FakeEventSource.last.onerror?.();
    expect(link.state).toBe('offline');
    vi.advanceTimersByTime(600);
    FakeEventSource.last.onerror?.();
    expect(link.state).toBe('offline');
  });

  it('delivers only the requested job and unsubscribes cleanly', async () => {
    const link = await freshLink(); link.connect();
    FakeEventSource.last.emit('hello', hello('a'));
    const seen: string[] = [];
    const stop = link.onJob('job-1', (job) => seen.push(`${job.state}:${job.progress}`));
    FakeEventSource.last.emit('job.progress', { jobId: 'job-2', state: 'running', progress: 0.9 });
    FakeEventSource.last.emit('job.progress', { jobId: 'job-1', state: 'running', progress: 0.5 });
    FakeEventSource.last.emit('job.done', { jobId: 'job-1', state: 'done', progress: 1 });
    stop();
    FakeEventSource.last.emit('job.progress', { jobId: 'job-1', state: 'running', progress: 0.1 });
    expect(seen).toEqual(['running:0.5', 'done:1']);
  });

  it('waitOnline resolves when the service comes up and rejects on timeout', async () => {
    const link = await freshLink(); link.connect();
    const pending = link.waitOnline(5000);
    FakeEventSource.last.emit('hello', hello('a'));
    await expect(pending).resolves.toBeUndefined();
    const other = await freshLink();
    const timeout = other.waitOnline(1000);
    const assertion = expect(timeout).rejects.toThrow();
    vi.advanceTimersByTime(1100);
    await assertion;
  });
});

describe('formatDisplayPatientName', () => {
  it('splits concatenated Meyer DICOM Turkish names into [Ad 1] + [Ad 2] + [Soyad]', () => {
    expect(formatDisplayPatientName('HACIAHMETKARAHAN')).toBe('HACI AHMET KARAHAN');
    expect(formatDisplayPatientName('MEHMETFERHATOZCAN')).toBe('MEHMET FERHAT OZCAN');
    expect(formatDisplayPatientName('SERGENGUNEY')).toBe('SERGEN GUNEY');
    expect(formatDisplayPatientName('BERATINCECAM')).toBe('BERAT INCECAM');
    expect(formatDisplayPatientName('MUSTAFAKEMALYILMAZ')).toBe('MUSTAFA KEMAL YILMAZ');
    expect(formatDisplayPatientName('ALIRIZADEMIR')).toBe('ALI RIZA DEMIR');
  });

  it('preserves already spaced or caret-separated DICOM names', () => {
    expect(formatDisplayPatientName('KARAHAN^HACI^AHMET')).toBe('KARAHAN HACI AHMET');
    expect(formatDisplayPatientName('HACI AHMET KARAHAN')).toBe('HACI AHMET KARAHAN');
    expect(formatDisplayPatientName('INCISIX')).toBe('INCISIX');
    expect(formatDisplayPatientName('')).toBe('—');
  });
});

describe('OS detection, installer URLs & Multi-Clinic domain headers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects Windows and macOS user agents and selects the matching installer URL', async () => {
    const { detectClientOs, getDownloadUrl } = await import('./serviceUi');
    vi.stubGlobal('navigator', {
      platform: 'Win32',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    expect(detectClientOs()).toBe('windows');
    expect(getDownloadUrl()).toContain('PineClinic-Lokal-Servisler-Setup.exe');

    vi.stubGlobal('navigator', {
      platform: 'MacIntel',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15',
    });
    expect(detectClientOs()).toBe('mac');
    expect(getDownloadUrl()).toContain('PineClinic-Lokal-Servisler.dmg');
  });

  it('extracts normalized clinic domain and attaches X-Clinic-Domain with loopback failover', async () => {
    vi.resetModules();
    vi.stubGlobal('window', {
      ...globalThis,
      location: { hostname: 'www.Klinik1.PineClinic.com' },
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch 127.0.0.1'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { getClinicDomain, cbctFetch, getActiveApiBase } = await import('./service');
    expect(getClinicDomain()).toBe('klinik1.pineclinic.com');

    const resp = await cbctFetch('/api/health');
    expect(resp.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8000/api/health');
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:8000/api/health');
    expect(getActiveApiBase()).toBe('http://localhost:8000');

    const init = fetchMock.mock.calls[1][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('X-Clinic-Domain')).toBe('klinik1.pineclinic.com');
    expect(init.credentials).toBe('omit');
    expect(init.mode).toBe('cors');
  });
});
