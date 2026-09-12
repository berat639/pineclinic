# Project Guidelines & Rules

## UI & Design Rules
1. **Glassmorphism Kesinlikle Yasaktır**:
   - Cam efekti (`backdrop-filter: blur`), yarı saydam sisli/cam arka planlar (`rgba(255,255,255,0.03)` vb.) KESİNLİKLE KULLANILMAYACAKTIR.
2. **Düz, Opak ve Yüksek Kontrastlı Tasarım (Solid Flat Architecture)**:
   - Tüm kartlar, modallar, popoverlar ve paneller opak, net ve düz (solid) arka planlara sahip olmalıdır (Dark mod için `#1e293b` / `#0f172a`, Light mod için `#ffffff`).
   - Kontrastlar yüksek olmalı, koyu tema üzerinde koyu mavi gibi okunaksız renkler yerine net beyaz (`#ffffff`) veya açık gri (`#e2e8f0` / `#94a3b8`) kullanılmalıdır.
   - Girdi alanları (`input`, `select`) net sınır çizgilerine (`#334155`) ve solid arka planlara sahip olmalıdır.

## Project Isolation Rules
1. **gemini-live-test Bağımsızlığı**:
   - `gemini-live-test` klasörü tamamen ayrı ve bağımsız bir projedir. `voiceai` ile paralel geliştirilmemelidir.
   - Bu klasördeki dosyalar üzerinde işlem yaparken `voiceai` projesi bağlamı (context) dahil EDİLMEMELİDİR.

## Software Architecture & Code Quality Rules
1. **Modern ve Gelişmiş Tasarım Desenleri (Design Patterns)**:
   - Yazılım mimarisi her zaman en güncel, yüksek performanslı ve ölçeklenebilir pattern'ler kullanılarak inşa edilmelidir (örn. asenkron yapılar, event-driven architecture, modüler ve decoupled bileşenler).
2. **Temiz Kod (Clean Code) ve Hatasızlık**:
   - Spagetti kod yazılmamalıdır. Kod her zaman SOLID prensiplerine, DRY (Don't Repeat Yourself) ve KISS (Keep It Simple, Stupid) kurallarına uygun olmalıdır.
   - Yapılan her değişiklikte, mevcut sistemin kırılmamasına azami özen gösterilmeli, hata payı sıfıra indirilmelidir.
3. **Şeffaf Tasarım Kesinlikle Yasaktır (Tekrar)**:
   - UI tarafında şeffaf (transparent), yarı saydam veya cam efekti içeren HİÇBİR tasarıma yer verilmemelidir. Arayüz elemanları daima opak ve net hatlara (solid) sahip olmalıdır.
