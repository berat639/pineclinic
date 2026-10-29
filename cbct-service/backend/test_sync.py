"""Yerel Servis ve DICOM Meta Ayrıştırıcı Birim Testleri (stdlib unittest).

Çalıştırma komutu:
  backend/.venv/bin/python -m unittest backend/test_sync.py -v
"""
from __future__ import annotations

import json
import os
import queue
import socket
import sys
import threading
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
os.environ["PINECLINIC_CONTROL_TOKEN"] = "test-token"

import httpx  # noqa: E402
import numpy as np  # noqa: E402
import SimpleITK as sitk  # noqa: E402
import uvicorn  # noqa: E402

import main  # noqa: E402

TOKEN = {"X-Control-Token": "test-token"}


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class SseClient:
    """Arka plan iş parçacığında `/api/events` SSE akışından gelen olayları toplar."""

    def __init__(self, base: str, role: str = "viewer", headers: dict[str, str] | None = None) -> None:
        self.events: queue.Queue[tuple[str, dict]] = queue.Queue()
        self._stop = threading.Event()
        self.status: int | None = None
        self._thread = threading.Thread(target=self._run, args=(base, role, headers or {}), daemon=True)
        self._thread.start()

    def _run(self, base: str, role: str, headers: dict[str, str]) -> None:
        try:
            with httpx.stream("GET", f"{base}/api/events", params={"role": role}, headers=headers, timeout=None) as response:
                self.status = response.status_code
                if response.status_code != 200:
                    self.events.put(("http-error", {"status": response.status_code}))
                    return
                event = ""
                for line in response.iter_lines():
                    if self._stop.is_set():
                        return
                    if line.startswith("event: "):
                        event = line[7:]
                    elif line.startswith("data: "):
                        self.events.put((event, json.loads(line[6:])))
        except httpx.HTTPError:
            self.events.put(("closed", {}))
            return
        self.events.put(("closed", {}))

    def wait_for(self, name: str, timeout: float = 5.0, where=lambda data: True) -> dict:
        deadline = time.time() + timeout
        seen = []
        while time.time() < deadline:
            try:
                event, data = self.events.get(timeout=max(0.01, deadline - time.time()))
            except queue.Empty:
                break
            seen.append(event)
            if event == name and where(data):
                return data
        raise AssertionError(f"event {name!r} not received; saw {seen}")

    def close(self) -> None:
        self._stop.set()


def fake_segment(image, log, on_progress, is_cancelled):
    nx, ny, nz = image.GetSize()
    for tile in range(1, 5):
        time.sleep(0.10)
        if is_cancelled():
            raise main.dental_infer.SegmentationCancelled()
        on_progress(tile, 4, 0.0)
    return np.ones((nz, ny, nx), dtype=np.uint8)


class SyncTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        main.CONTROL_TOKEN = "test-token"
        main.selected_engine = lambda: ("dental", "PyTorch MPS")
        main.dental_infer.segment_dental = fake_segment
        cls.port = free_port()
        cls.base = f"http://127.0.0.1:{cls.port}"
        cls.server = uvicorn.Server(uvicorn.Config(main.app, host="127.0.0.1", port=cls.port, log_level="warning", timeout_graceful_shutdown=2))
        main.SERVER = cls.server
        cls.thread = threading.Thread(target=cls.server.run, daemon=True)
        cls.thread.start()
        for _ in range(100):
            try:
                if httpx.get(f"{cls.base}/api/health").status_code == 200:
                    break
            except httpx.HTTPError:
                time.sleep(0.05)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.should_exit = True
        cls.thread.join(timeout=5)

    def register(self, fingerprint: str) -> str:
        image = sitk.Image(8, 8, 4, sitk.sitkInt16)
        image.SetSpacing((0.5, 0.5, 0.5))
        dataset_id, _ = main.register_dataset(image, fingerprint, f"synthetic {fingerprint}")
        return dataset_id

    def test_00_dicom_date_and_vendor_formatting(self) -> None:
        # Sadece yıl, ay.yıl, gün.ay.yıl ve saat · gün.ay.yıl kademeli tarih formatlama testleri
        self.assertEqual(main.format_dicom_date_time("1982")[0], "1982")
        self.assertEqual(main.format_dicom_date_time("19820000")[0], "1982")
        self.assertEqual(main.format_dicom_date_time("198205")[0], "05.1982")
        self.assertEqual(main.format_dicom_date_time("19820514")[0], "14.05.1982")
        self.assertEqual(main.format_dicom_date_time("20261028", "143522.000")[0], "14:35 · 28.10.2026")

        # Meyer, KaVo ve NewTom cihaz uyumluluğu testleri
        img = sitk.Image(480, 480, 320, sitk.sitkInt16)
        img.SetSpacing((0.25, 0.25, 0.25))
        img.SetMetaData("0010|0010", "YILMAZ^AHMET")
        img.SetMetaData("0010|0020", "104829")
        img.SetMetaData("0010|0030", "19820514")
        img.SetMetaData("0010|0040", "M")
        img.SetMetaData("0008|0020", "20261028")
        img.SetMetaData("0008|0030", "143000")
        img.SetMetaData("0008|0070", "QR s.r.l.")
        img.SetMetaData("0008|1090", "VGi evo")
        img.SetMetaData("0018|0060", "90")
        img.SetMetaData("0018|8151", "6000")  # Meyer uA -> 6 mA
        img.SetMetaData("0018|1150", "8100")  # KaVo ms -> 8.1 sn
        meta = main.extract_dicom_meta(img)
        self.assertEqual(meta["patientName"], "Ahmet Yilmaz")
        self.assertEqual(meta["birthDate"], "14.05.1982 (44 yaş)")
        self.assertEqual(meta["sex"], "Erkek")
        self.assertEqual(meta["studyDate"], "14:30 · 28.10.2026")
        self.assertEqual(meta["device"], "NewTom VGi evo")
        self.assertEqual(meta["exposure"], "90 kVp · 6 mA · 8.1 sn")

    def test_01_hello_and_health_identity(self) -> None:
        client = SseClient(self.base)
        hello = client.wait_for("hello")
        resp = httpx.get(f"{self.base}/api/health")
        health = resp.json()
        self.assertEqual(hello["instanceId"], health["instanceId"])
        self.assertEqual(hello["apiVersion"], main.API_VERSION)
        self.assertEqual(health["apiVersion"], main.API_VERSION)
        self.assertTrue(health["resultCacheEnabled"])
        self.assertEqual(resp.headers["cache-control"], "no-store")
        self.assertEqual(resp.headers["access-control-allow-private-network"], "true")
        client.wait_for("clients", where=lambda d: d["viewers"] >= 1)
        client.close()

    def test_02_job_lifecycle_is_streamed(self) -> None:
        client = SseClient(self.base)
        client.wait_for("hello")
        dataset_id = self.register("job-lifecycle")
        client.wait_for("dataset.opened", where=lambda d: d["datasetId"] == dataset_id)
        job_id = httpx.post(f"{self.base}/api/datasets/{dataset_id}/jobs/segment").json()["jobId"]
        mine = lambda d: d["jobId"] == job_id
        client.wait_for("job.queued", where=mine)
        client.wait_for("job.running", where=mine)
        progress = client.wait_for("job.progress", where=mine)
        self.assertGreater(progress["progress"], 0)
        done = client.wait_for("job.done", where=mine)
        self.assertEqual(done["progress"], 1.0)
        mask = httpx.get(f"{self.base}/api/jobs/{job_id}/mask")
        self.assertEqual(mask.status_code, 200)
        self.assertEqual(mask.headers.get("x-segmentation-schema"), "dental-segmentator-v1")
        self.assertEqual(len(mask.content), 8 * 8 * 4)
        client.close()

    def test_03_release_dataset_cancels_and_announces(self) -> None:
        client = SseClient(self.base)
        client.wait_for("hello")
        dataset_id = self.register("release")
        job_id = httpx.post(f"{self.base}/api/datasets/{dataset_id}/jobs/segment").json()["jobId"]
        client.wait_for("job.running", where=lambda d: d["jobId"] == job_id)
        self.assertTrue(httpx.delete(f"{self.base}/api/datasets/{dataset_id}").json()["released"])
        client.wait_for("job.cancelled", where=lambda d: d["jobId"] == job_id)
        client.wait_for("dataset.released", where=lambda d: d["datasetId"] == dataset_id)
        self.assertEqual(httpx.get(f"{self.base}/api/datasets/{dataset_id}/volume").status_code, 404)
        client.close()

    def test_04_control_endpoints_require_token(self) -> None:
        self.assertEqual(httpx.post(f"{self.base}/api/control/shutdown").status_code, 403)
        self.assertEqual(httpx.post(f"{self.base}/api/control/shutdown", headers={"X-Control-Token": "wrong"}).status_code, 403)
        manager = SseClient(self.base, role="manager")
        self.assertEqual(manager.wait_for("http-error")["status"], 403)

    def test_05_pick_folder_round_trip(self) -> None:
        response = httpx.post(f"{self.base}/api/pick-folder")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["reason"], "no-manager")
        manager = SseClient(self.base, role="manager", headers=TOKEN)
        manager.wait_for("hello")
        result: dict = {}
        viewer_call = threading.Thread(target=lambda: result.update(httpx.post(f"{self.base}/api/pick-folder", timeout=10).json()))
        viewer_call.start()
        request = manager.wait_for("pick-folder.request")
        delivered = httpx.post(f"{self.base}/api/control/pick-folder/{request['requestId']}", json={"path": "/tmp/series"}, headers=TOKEN).json()
        self.assertTrue(delivered["delivered"])
        viewer_call.join(timeout=5)
        self.assertEqual(result, {"path": "/tmp/series"})
        manager.close()

    def test_06_multi_clinic_pna_and_domain_isolation(self) -> None:
        # 1) HTTPS Özel Klinik Domaininden (`https://klinik1.pineclinic.com`) PNA Preflight (OPTIONS) testi
        preflight = httpx.options(
            f"{self.base}/api/datasets/path",
            headers={
                "Origin": "https://klinik1.pineclinic.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,x-clinic-domain",
                "Access-Control-Request-Private-Network": "true",
            },
        )
        self.assertEqual(preflight.status_code, 200, preflight.text)
        self.assertEqual(preflight.headers.get("access-control-allow-private-network"), "true")
        self.assertEqual(preflight.headers.get("access-control-allow-local-network"), "true")
        self.assertEqual(preflight.headers.get("access-control-allow-origin"), "https://klinik1.pineclinic.com")

        # 2) İki farklı klinik domaini (`klinik1.pineclinic.com` ve `klinik2.dismerkezi.com.tr`) için veri seti ve önbellek izolasyonu
        img = sitk.Image(8, 8, 4, sitk.sitkInt16)
        img.SetSpacing((0.5, 0.5, 0.5))
        ds_k1, _ = main.register_dataset(img, "shared-fp", "series-k1", clinic_domain="https://www.klinik1.pineclinic.com")
        ds_k2, _ = main.register_dataset(img, "shared-fp", "series-k2", clinic_domain="klinik2.dismerkezi.com.tr")

        k1_list = httpx.get(
            f"{self.base}/api/datasets",
            headers={"X-Clinic-Domain": "klinik1.pineclinic.com"},
        ).json()
        self.assertEqual(k1_list["clinicDomain"], "klinik1.pineclinic.com")
        k1_ids = [d["datasetId"] for d in k1_list["datasets"]]
        self.assertIn(ds_k1, k1_ids)
        self.assertNotIn(ds_k2, k1_ids)

        k2_list = httpx.get(
            f"{self.base}/api/datasets",
            headers={"Origin": "https://klinik2.dismerkezi.com.tr"},
        ).json()
        self.assertEqual(k2_list["clinicDomain"], "klinik2.dismerkezi.com.tr")
        k2_ids = [d["datasetId"] for d in k2_list["datasets"]]
        self.assertIn(ds_k2, k2_ids)
        self.assertNotIn(ds_k1, k2_ids)

    def test_99_graceful_shutdown_notifies_clients(self) -> None:
        viewer = SseClient(self.base)
        viewer.wait_for("hello")
        manager = SseClient(self.base, role="manager", headers=TOKEN)
        manager.wait_for("hello")
        self.assertEqual(httpx.post(f"{self.base}/api/control/shutdown", headers=TOKEN).status_code, 200)
        self.assertEqual(viewer.wait_for("service.stopping")["reason"], "user")
        manager.wait_for("service.stopping")
        self.thread.join(timeout=5)
        self.assertFalse(self.thread.is_alive(), "server did not exit after shutdown")


if __name__ == "__main__":
    unittest.main()
