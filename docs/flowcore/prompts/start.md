# FlowCore — Başlangıç Komutu

Aşağıdaki metni herhangi bir IDE / ajana (Copilot, Claude Code, Gemini CLI, Codex) yapıştırın:

---

FlowCore projesinde çalışıyorsun.

1. Önce şu dosyaları sırayla oku:
   - flowcore reposu varsa: `/Users/beratincecam/Desktop/flowcore/AGENTS.md`, `docs/plan.md`, `docs/progress.md`, `docs/decisions.md`, `docs/glossary.md`
   - yoksa: `/Users/beratincecam/Desktop/voiceai/docs/flowcore/` altındaki `AGENTS.md`, `plan.md`, `progress.md`, `decisions.md`, `glossary.md`
2. `plan.md` başındaki Durum "ONAY BEKLİYOR" ise hiçbir kod kartını uygulama; bana durumu özetle ve onay iste. Durum satırını kendin değiştirme.
3. Durum "ONAYLANDI" ise `plan.md` kart sırasına göre, `progress.md`'de `DONE` olmayan ve bağımlılıkları `DONE` olan ilk kartı seç.
4. Yalnız o kartı uygula; `plan.md` Bölüm 0 kurallarına uy (voiceai salt okunur, tek istisna `voiceai/docs/flowcore/**`).
5. Kabul kriterlerini ve doğrulama komutunu çalıştır.
6. `progress.md`'ye satır ekle (Kart | Durum | Değişen dosyalar | Doğrulama | Tarih | Ajan/IDE).
7. Belirsizlik varsa `decisions.md`'ye soru yaz, kartı `BLOCKED` işaretle ve dur.
8. Kart bitince dur ve bana özet ver; bir sonraki karta kendiliğinden geçme.

---
