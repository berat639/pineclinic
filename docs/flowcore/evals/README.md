# Değerlendirme Senaryoları

Bu klasördeki `*.yaml` dosyaları, bir akışın yayından önce nasıl davrandığını sınar.
Sentetik bir müşteri (kişilik + hedef) görüşme turları üretir; test edilen akış yanıt verir;
beklentiler tek tek denetlenir.

## Dosya biçimi

```yaml
scenarios:
  - name: Senaryo adı
    persona: Müşterinin kişiliği
    goal: Müşterinin hedefi
    openingMessage: İsteğe bağlı ilk mesaj
    maxTurns: 8          # en çok tur (varsayılan 8)
    expectations:
      - type: contains        # yanıtta geçmeli
        value: metin
      - type: notContains     # yanıtta geçmemeli
        value: metin
      - type: toolCalled      # araç çağrılmalı
        tool: arac_adi
      - type: fieldFilled     # alan dolmalı
        field: alan_adi
      - type: maxTurns        # görüşme bu turda bitmeli
        value: 4
      - type: judge           # yargıç modeli ölçütü onaylamalı
        criteria: Ölçüt metni
```

## Kullanım

```ts
import { evaluatePublishGate, loadScenarioFile, runEvalSuite } from "@flowcore/ai/src/eval";

const scenarios = await loadScenarioFile("docs/evals/rezervasyon.yaml");
const report = await runEvalSuite({ llm, scenarios, respond });
const gate = evaluatePublishGate(report, { minPassRate: 1 });
```

Yayın uç noktası `evalGate` seçeneği verilirse, kapı geçmediğinde yayını 409 ile reddeder.
