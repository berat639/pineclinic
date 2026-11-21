# FlowCore Plan Belgeleri

Bu klasör **FlowCore** projesinin planıdır (ayrı repo: `~/Desktop/flowcore`). voiceai kodunu etkilemez; voiceai'nin kök `AGENTS.md` dosyası bu projeye uygulanmaz.

Plan durumu: **ONAYLANDI** (Güncel kopya `/Users/beratincecam/Desktop/flowcore/docs` altındadır)

## Dosyalar

| Dosya | İçerik | Kim okur |
|---|---|---|
| `plan.md` | Tam plan ve görev kartları | Tüm ajanlar |
| `AGENTS.md` | Ajan çalışma kuralları | Copilot, Codex (ve diğerleri) |
| `GEMINI.md` | `AGENTS.md` + `plan.md` içe aktarımı | Gemini CLI |
| `CLAUDE.md` | `AGENTS.md` + `plan.md` içe aktarımı | Claude Code |
| `progress.md` | Kart durumları | Devam eden her ajan |
| `decisions.md` | Kararlar ve açık sorular | Herkes |
| `glossary.md` | Kod terimleri ve arayüz metin eşlemesi | Herkes |
| [database-schema.md](database-schema.md) | Çekirdek tablolar, ilişkiler ve bağlantı bilgisi şifrelemesi | Veritabanı üzerinde çalışan ajanlar |
| [dynamic-entities.md](dynamic-entities.md) | Dinamik kayıt türleri, bilgi alanları ve kayıt modeli | Veritabanı ve derleyici üzerinde çalışan ajanlar |
| [migrations.md](migrations.md) | Kalıcı kurulum, şema onarımı ve örnek veri | Sunucu üzerinde çalışan ajanlar |
| [authentication.md](authentication.md) | Oturumlar, çerezler, rol ve kiracı erişimi | API ve Studio üzerinde çalışan ajanlar |
| [api.md](api.md) | Çekirdek API yolları ve veri sözleşmeleri | API ve Studio üzerinde çalışan ajanlar |
| [tenant-management.md](tenant-management.md) | Kanal, konuşma/mesaj ve güvenli üyelik/davet uçları (T-1.6) | API ve Studio üzerinde çalışan ajanlar |
| [phase1-acceptance.md](phase1-acceptance.md) | Gerçek PostgreSQL ve HTTP ile tekrarlanabilir Faz 1 kabulü | Doğrulama yapan ajanlar |
| [runtime.md](runtime.md) | Oturum motoru, kalıcı durum, Redis, DBOS ve Faz 4 kabulü | Çalışma zamanı ve kanal geliştiren ajanlar |
| [knowledge.md](knowledge.md) | Kaynaklar, hibrit arama, model adaptörü, DBOS güncellemesi, dinamik bağlam ve SSS | Bilgi tabanı ve kanal geliştiren ajanlar |
| [execution-audit.md](execution-audit.md) | Planın tüm kartları ve kalan kabul kapıları | Tüm ajanlar |
| `prompts/start.md` | Herhangi bir IDE'ye yapıştırılacak başlangıç komutu | Kullanıcı |

## Başka IDE ile devam etme

1. IDE'de klasör olarak `/Users/beratincecam/Desktop/voiceai/docs/flowcore` (veya oluştuysa `~/Desktop/flowcore`) açın. voiceai kökünü açarsanız klinik projesinin `AGENTS.md` dosyası yüklenir ve kurallar karışır.
2. `prompts/start.md` içindeki metni ajana yapıştırın.
3. Gemini CLI bu klasörde `GEMINI.md`'yi, Claude Code `CLAUDE.md`'yi, Codex ve Copilot `AGENTS.md`'yi okur. Copilot'ta voiceai kökü açıkken iç içe `AGENTS.md` yalnız `chat.useNestedAgentsMdFiles` ayarı açıksa okunur.

## Onay verme

Planı onaylamak için `plan.md` başındaki `Durum:` satırını `ONAYLANDI` yapın ve `decisions.md` Q-1'i kapatın. Ajanlar bu satırı kendileri değiştirmez.

## Senkronizasyon

T-0.1 ile flowcore reposu oluşturulduğunda bu belgeler `flowcore/` köküne ve `flowcore/docs/` altına kopyalanır. O andan sonra güncel kopya flowcore reposundadır; `progress.md` her kart sonunda iki yerde güncellenir.
- [Mesaj kanalları](channels.md) — Faz 7: adaptörler, uç noktalar, çalışan ve Gelen Kutusu.
