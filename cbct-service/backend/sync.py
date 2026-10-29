"""Yerel Servis İçin Gerçek Zamanlı Senkronizasyon (SSE EventBus & Klasör Seçici Köprüsü).

Mimari Rolü:
- Tarayıcıdaki görüntüleyici sekmeleri (`role=viewer`) ve Electron masaüstü yöneticisi (`role=manager`)
  tek bir Server-Sent Events (`/api/events`) akışına abone olur.
- Veri seti açma/kapama, AI segmentasyon ilerlemesi ve servis kapanış sinyalleri hem FastAPI
  olay döngüsünden hem de arka plan AI iş parçacığından (thread-safe olarak) yayınlanır.
"""
from __future__ import annotations

import asyncio
import json
import threading
import time
from dataclasses import dataclass

# İstemci bağlantılarının canlılığını izlemek için kalp atışı (heartbeat) aralığı (saniye)
HEARTBEAT_SECONDS = 2.0
# AI ilerleme bildirimlerinin arayüzü boğmaması için minimum yayın aralığı (saniyede en fazla 4 olay)
PROGRESS_MIN_INTERVAL = 0.25


def sse(event: str, data: object) -> str:
    """Tek bir Server-Sent Event (SSE) çerçevesini standart metin formatında kodlar."""
    return f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"


@dataclass
class _Subscriber:
    loop: asyncio.AbstractEventLoop
    queue: asyncio.Queue[str]
    role: str


class EventBus:
    """Bağlı tüm istemcilere (tarayıcı ve Electron yöneticisi) iş parçacığı güvenli SSE dağıtımı yapar."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subscribers: dict[int, _Subscriber] = {}
        self._next_id = 0
        self._last_progress: dict[str, float] = {}
        self.last_viewer_seen = time.time()

    def subscribe(self, role: str) -> tuple[int, asyncio.Queue[str]]:
        """Yeni bir istemciyi (`viewer` veya `manager`) olay kuyruğuna kaydeder."""
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=1000)
        with self._lock:
            self._next_id += 1
            subscriber_id = self._next_id
            self._subscribers[subscriber_id] = _Subscriber(asyncio.get_running_loop(), queue, role)
            if role == "viewer":
                self.last_viewer_seen = time.time()
        return subscriber_id, queue

    def unsubscribe(self, subscriber_id: int) -> None:
        """Bağlantısı kopan istemciyi abonelikten çıkarır ve son aktif zamanı günceller."""
        with self._lock:
            subscriber = self._subscribers.pop(subscriber_id, None)
            if subscriber and subscriber.role == "viewer":
                self.last_viewer_seen = time.time()

    def counts(self) -> dict[str, int]:
        """Aktif bağlı tarayıcı (`viewers`) ve masaüstü yönetici (`managers`) sayılarını döndürür."""
        with self._lock:
            roles = [subscriber.role for subscriber in self._subscribers.values()]
        return {"viewers": roles.count("viewer"), "managers": roles.count("manager")}

    def publish(self, event: str, data: object, *, roles: set[str] | None = None, throttle_key: str | None = None) -> bool:
        """Olayı hedef abonelere kuyruğa ekler. Hız sınırına (throttle) takılırsa False döndürür."""
        now = time.monotonic()
        with self._lock:
            if throttle_key is not None:
                if now - self._last_progress.get(throttle_key, 0.0) < PROGRESS_MIN_INTERVAL:
                    return False
                self._last_progress[throttle_key] = now
            targets = [s for s in self._subscribers.values() if roles is None or s.role in roles]
        frame = sse(event, data)
        for subscriber in targets:
            try:
                subscriber.loop.call_soon_threadsafe(self._put, subscriber.queue, frame)
            except RuntimeError:
                pass
        return True

    @staticmethod
    def _put(queue: asyncio.Queue[str], frame: str) -> None:
        try:
            queue.put_nowait(frame)
        except asyncio.QueueFull:
            # Yavaşlayan bir istemci servisi asla bloklamamalıdır; yeniden bağlandığında
            # `hello` anlık görüntüsüyle (snapshot) durumu senkronize olur.
            pass


class FolderPickBroker:
    """Tarayıcının yerel klasör seçme isteğini Electron masaüstü uygulamasına yönlendirir."""

    def __init__(self) -> None:
        self._pending: dict[str, asyncio.Future[dict[str, object]]] = {}

    def create(self, request_id: str) -> asyncio.Future[dict[str, object]]:
        future: asyncio.Future[dict[str, object]] = asyncio.get_running_loop().create_future()
        self._pending[request_id] = future
        return future

    def resolve(self, request_id: str, result: dict[str, object]) -> bool:
        future = self._pending.get(request_id)
        if not future or future.done():
            return False
        future.set_result(result)
        return True

    def discard(self, request_id: str) -> None:
        self._pending.pop(request_id, None)
