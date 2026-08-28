# Project Guidelines & Rules

## UI & Design Rules
1. **Glassmorphism Kesinlikle Yasaktır**:
   - Cam efekti (`backdrop-filter: blur`), yarı saydam sisli/cam arka planlar (`rgba(255,255,255,0.03)` vb.) KESİNLİKLE KULLANILMAYACAKTIR.
2. **Düz, Opak ve Yüksek Kontrastlı Tasarım (Solid Flat Architecture)**:
   - Tüm kartlar, modallar, popoverlar ve paneller opak, net ve düz (solid) arka planlara sahip olmalıdır (Dark mod için `#1e293b` / `#0f172a`, Light mod için `#ffffff`).
   - Kontrastlar yüksek olmalı, koyu tema üzerinde koyu mavi gibi okunaksız renkler yerine net beyaz (`#ffffff`) veya açık gri (`#e2e8f0` / `#94a3b8`) kullanılmalıdır.
   - Girdi alanları (`input`, `select`) net sınır çizgilerine (`#334155`) ve solid arka planlara sahip olmalıdır.
