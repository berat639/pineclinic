export interface OfficialConsentTreatmentRow {
  toothLabel: string
  indications: string
  procedureName: string
  doctorName: string
  amountFormatted: string
  unitNote?: string
}

export interface OfficialMinistryClause {
  id: string
  code: string
  title: string
  purposeAndMethod: string
  alternatives: string
  risksAndComplications: string
  refusalConsequences: string
  postOpCare: string
}

export interface OfficialConsentDocumentData {
  documentCode?: string
  publishDate?: string
  revisionNo?: string
  clinicName: string
  patientName: string
  tcKimlikNo: string
  protocolNo: string
  birthDate: string
  phone: string
  doctorName: string
  dateTime: string
  medicalConditions: string
  allergies: string
  medications: string
  pregnancyStatus: string
  specialNotes: string
  guardianName: string
  guardianRelation: string
  witnessName: string
  includeAllMinistryClauses?: boolean
  treatments: OfficialConsentTreatmentRow[]
  subtotalFormatted: string
  discountFormatted: string
  totalFormatted: string
}

export const OFFICIAL_MINISTRY_CLAUSES: OfficialMinistryClause[] = [
  {
    id: 'anesthesia_general',
    code: 'BÖLÜM 4.1',
    title: 'Lokal Anestezi ve Genel Diş Hekimliği Girişimsel Uygulamaları Aydınlatması',
    purposeAndMethod:
      'Diş hekimliği teşhis ve tedavi işlemlerinin ağrısız ve konforlu şekilde yürütülebilmesi amacıyla, işlem yapılacak anatomik bölgeye topikal ve/veya enjeksiyon yoluyla lokal anestezik solüsyon uygulanır.',
    alternatives:
      'Çok yüzeyel işlemlerde anestezi uygulanmadan işlem yapılması veya tıbbi zorunluluk halinde sedasyon / genel anestezi altında hastane koşullarında müdahale.',
    risksAndComplications:
      'Geçici uyuşukluk süresince dudak, dil veya yanağın fark edilmeden ısırılması; enjeksiyon bölgesinde ağrı, hematom (morarma/şişlik), trismus (ağız açmada geçici kısıtlılık); nadir olarak geçici fasiyal sinir etkilenmesi, çarpıntı (taşikardi), terleme, senkop (baygınlık) veya lokal anestezik maddelere karşı alerjik reaksiyonlar.',
    refusalConsequences:
      'Lokal anestezinin reddedilmesi durumunda şiddetli ağrı nedeniyle girişimsel diş tedavilerinin güvenli ve etkin biçimde gerçekleştirilememesi.',
    postOpCare:
      'Uyuşukluk tamamen geçene kadar (yaklaşık 2–4 saat) katı gıda tüketilmemeli ve sıcak içeceklerden kaçınılmalıdır.',
  },
  {
    id: 'restorative',
    code: 'BÖLÜM 4.2',
    title: 'Restoratif Diş Tedavisi (Kompozit / Amalgam Dolgu, Kuafaj, İnley / Onley) Aydınlatması',
    purposeAndMethod:
      'Çürük, kırık, aşınma veya madde kaybı bulunan diş dokularının temizlenerek uygun biyouyumlu restoratif materyaller (kompozit reçine, cam iyonomer, seramik vb.) ile dişin anatomik form, fonksiyon ve estetiğinin yeniden kazandırılması.',
    alternatives:
      'Madde kaybının büyüklüğüne göre indirekt restorasyonlar (inley, onley, kuron kaplama) veya pulpa etkilenmesi varsa kanal tedavisi / diş çekimi.',
    risksAndComplications:
      'İşlem sonrasında birkaç gün ile birkaç hafta sürebilen sıcak-soğuk ve çiğneme hassasiyeti; derin çürüklerin temizlenmesi esnasında diş sinirinin (pulpa) mikroskobik veya klinik olarak açığa çıkması ve buna bağlı olarak kanal tedavisi gereksinimi doğması; zamanla dolguda renklenme, kenar sızıntısı veya aşırı kuvvetlerde kırılma.',
    refusalConsequences:
      'Çürüğün ilerleyerek dişin canlı dokusuna (pulpa) ulaşması, şiddetli gece ağrıları, akut apse gelişimi ve dişin çekimle kaybedilmesi.',
    postOpCare:
      'Sert kabuklu gıdaların doğrudan restore edilen dişle kırılmaması, düzenli fırçalama ve diş ipi kullanımı.',
  },
  {
    id: 'endodontic',
    code: 'BÖLÜM 4.3',
    title: 'Endodontik Tedavi (Kanal Tedavisi, Kanal Yenileme / Retreatment) Aydınlatması',
    purposeAndMethod:
      'İleri çürük, travma veya enfeksiyon nedeniyle geri dönüşümsüz hasar gören ya da canlılığını yitiren diş sinir-damar paketinin (pulpa) kök kanallarından çıkarılması, kanalların şekillendirilip dezenfekte edilmesi ve biyouyumlu kanal dolgu maddeleriyle sızdırmaz şekilde doldurulması.',
    alternatives:
      'İlgili dişin çekilmesi ve oluşan boşluğun implant, sabit köprü veya hareketli protez ile telafi edilmesi.',
    risksAndComplications:
      'Seanslar arasında veya tedavi bitiminde birkaç gün sürebilen ağrı ve şişlik (flare-up); aşırı dar, kireçlenmiş (kalsifiye) veya eğri kök kanallarının tam boyutta açılamaması; mikro-endodontik kanal aletlerinin kök içinde kırılması; kök kanal duvarında perforasyon (delinme); kanal dolgusunun kök ucundan taşması; kanal tedavili dişin su kaybına bağlı kırılganlığının artması; dirençli enfeksiyonlarda apikal rezeksiyon (kök ucu cerrahisi) veya çekim gereksinimi.',
    refusalConsequences:
      'Kök ucu enfeksiyonunun çene kemiğine yayılması, akut/kronik apse, kist oluşumu, yüz ve boyun bölgesine yayılan ciddi enfeksiyonlar ve dişin kaybı.',
    postOpCare:
      'Tedavi tamamlanıp üst restorasyon (dolgu/kuron) yapılana kadar ilgili dişle sert gıdalar çiğnenmemelidir.',
  },
  {
    id: 'surgical',
    code: 'BÖLÜM 4.4',
    title: 'Ağız, Diş ve Çene Cerrahisi (Diş Çekimi, Gömülü Diş, Kök Ucu ve Kist Operasyonları) Aydınlatması',
    purposeAndMethod:
      'Restore edilemeyecek derecede yıkıma uğramış, ileri kemik kaybı bulunan, ortodontik/protetik endikasyonu olan veya gömülü/yarı gömülü kalan dişlerin lokal anestezi altında basit veya cerrahi (dikişli/kemik kaldırmalı) yöntemle çekilmesi.',
    alternatives:
      'Klinik olarak kurtarılma şansı olan dişlerde kanal tedavisi, periodontal cerrahi veya kuron yükseltme işlemleri; çekim endikasyonu kesinleşmiş dişlerde tıbbi alternatif bulunmamaktadır.',
    risksAndComplications:
      'Operasyon sonrası ağrı, yüz bölgesinde ödem (şişlik), morarma (hematom), sızıntı şeklinde kanama; çekim boşluğundaki pıhtının bozulmasına bağlı ağrılı alveolit (kuru soket); çok köklü veya ankiloze dişlerde kök ucu kırılması; komşu diş veya dolguların zarar görmesi; üst çene arka bölge çekimlerinde maksiller sinüs boşluğu ile ağız arasında açıklık (oroantral fistül) oluşması; alt çene gömülü/arka diş çekimlerinde mandibular veya lingual sinir komşuluğuna bağlı dudak, çene ucu veya dilde geçici ya da çok nadiren kalıcı uyuşukluk/his kaybı (parestezi).',
    refusalConsequences:
      'Odak enfeksiyonun devam etmesi, tekrarlayan şiddetli apse/perikoronit atakları, çene kemiğinde kist büyümesi, komşu sağlıklı dişlerin köklerinin erimesi.',
    postOpCare:
      'Steril tampon 30–45 dakika ısırılmalı, ilk 24 saat tükürülmemeli, çalkalama yapılmamalı, sigara/alkol ve sıcak gıda tüketilmemelidir.',
  },
  {
    id: 'prosthetic_implant',
    code: 'BÖLÜM 4.5',
    title: 'Dental İmplantoloji ve Protetik Diş Tedavisi (Kuron, Köprü, Zirkonyum, Lamina, Protez) Aydınlatması',
    purposeAndMethod:
      'Eksik dişlerin çene kemiğine yerleştirilen titanyum dental implantlar veya komşu dişlerden destek alınan sabit (zirkonyum, porselen kuron/köprü, lamina) ya da hareketli protezler ile restore edilerek çiğneme, konuşma ve estetik fonksiyonların geri kazandırılması.',
    alternatives:
      'İmplant yerine sabit köprü veya hareketli bölümlü/tam protez uygulamaları; sabit kuron yerine konservatif restorasyonlar.',
    risksAndComplications:
      'İmplant cerrahisi sonrası ödem, kanama, enfeksiyon veya implantın kemikle kaynaşmaması (osseointegrasyon başarısızlığı / implant kaybı); ileri kemik erimesi olan bölgelerde kemik tozu (greft) ve sinüs lifting gereksinimi; anatomik komşuluklara bağlı sinir/sinüs etkilenmesi; kesilen (prepare edilen) canlı destek dişlerde sıcak-soğuk hassasiyeti veya sonradan kanal tedavisi ihtiyacı; porselen/zirkonyum materyalinde çatlama/kırılma veya yapıştırıcının çözünmesi (desimantasyon).',
    refusalConsequences:
      'Dişsiz boşluğa komşu dişlerin devrilmesi, karşıt çenedeki dişin boşluğa uzaması, çiğneme dengesinin bozulması, çene eklemi (TME) rahatsızlıkları ve çene kemiği erimesi.',
    postOpCare:
      'Ağız hijyeni, arayüz fırçası ve ağız duşu kullanımı ile 6 aylık periyodik hekim kontrollerine düzenli katılım zorunludur.',
  },
  {
    id: 'periodontal',
    code: 'BÖLÜM 4.6',
    title: 'Periodontal Tedavi (Diş Taşı Temizliği / Detertraj, Subgingival Küretaj, Diş Eti Tedavileri) Aydınlatması',
    purposeAndMethod:
      'Diş ve kök yüzeylerinde biriken mikrobiyal dental plak, diş taşı (tartar) ve iltihabi dokuların ultrasonik cihazlar ve el aletleriyle uzaklaştırılarak diş eti sağlığının yeniden kazandırılması ve kemik yıkımının durdurulması.',
    alternatives:
      'İleri periodontal yıkım bulunan bölgelerde açık/kapalı flep cerrahisi veya kemik desteğini tamamen yitirmiş dişlerin çekimi.',
    risksAndComplications:
      'İşlem sırasında ve sonrasındaki ilk günlerde diş etlerinde sızıntı şeklinde kanama ve sızlama; ödemli diş etlerinin iyileşip büzülmesiyle birlikte kök yüzeylerinin açığa çıkması ve geçici sıcak-soğuk hassasiyeti; diş taşlarının temizlenmesi sonrası dişler arasındaki mevcut fizyolojik boşlukların hissedilir hale gelmesi.',
    refusalConsequences:
      'Diş eti iltihabının (gingivitis/periodontitis) ilerlemesi, kronik ağız kokusu, diş eti çekilmesi, çene kemiği erimesi ve sağlam dişlerin sallanarak kaybedilmesi.',
    postOpCare:
      'Hekimin önerdiği fırçalama tekniği, diş ipi/arayüz fırçası ve gargara protokolüne düzenli uyulmalıdır.',
  },
]

function normalizeTrText(text: string): string {
  return (text || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
}

export function resolveRelevantConsentClauses(
  treatments: OfficialConsentTreatmentRow[],
  includeAll?: boolean
): OfficialMinistryClause[] {
  if (includeAll || !treatments || treatments.length === 0) {
    return OFFICIAL_MINISTRY_CLAUSES
  }

  const combined = normalizeTrText(
    treatments.map(t => `${t.procedureName || ''} ${t.indications || ''}`).join(' ')
  )

  const selectedIds = new Set<string>(['anesthesia_general'])

  if (/(dolgu|kompozit|amalgam|inley|onley|restorasyon|kuafaj|curuk|kirik|mine|dentin)/.test(combined)) {
    selectedIds.add('restorative')
  }
  if (/(kanal|endodonti|pulpa|devital|ekstirpasyon|retreatment|pansuman|kok kanal|apse|lezyon)/.test(combined)) {
    selectedIds.add('endodontic')
  }
  if (/(cekim|cerrahi|gomulu|operasyon|rezeksiyon|kist|alveol|sutur|dikis|20 yas|yirmi yas)/.test(combined)) {
    selectedIds.add('surgical')
  }
  if (/(implant|kuron|kopru|zirkon|porselen|lamina|veneer|protez|kaplama|abutment|greft|sinus)/.test(combined)) {
    selectedIds.add('prosthetic_implant')
  }
  if (/(dis tasi|detertraj|kuretaj|periodont|dis eti|gingiv|polisaj|temizlik|flep)/.test(combined)) {
    selectedIds.add('periodontal')
  }

  // If no specific category matched beyond anesthesia, include restorative & surgical as baseline
  if (selectedIds.size === 1) {
    selectedIds.add('restorative')
    selectedIds.add('surgical')
  }

  return OFFICIAL_MINISTRY_CLAUSES.filter(clause => selectedIds.has(clause.id))
}

export function buildOfficialConsentDataFromPlan(params: {
  patientName?: string
  patient?: any
  event?: any
  doctors?: any[]
  groupedRows?: any[]
  subtotalFormatted?: string
  discountFormatted?: string
  totalFormatted?: string
}): OfficialConsentDocumentData {
  const now = new Date()
  const formattedDateTime = now.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const doctorsList = Array.isArray(params.doctors) ? params.doctors : []
  const resolveDoctorNames = (item: any): string => {
    const ids = Array.isArray(item?.doctorIds) && item.doctorIds.length > 0
      ? item.doctorIds
      : item?.doctorId
      ? [item.doctorId]
      : []
    const names = ids
      .map((id: string) => doctorsList.find((d: any) => d.id === id)?.name)
      .filter(Boolean)
    if (names.length > 0) return names.join(', ')
    if (params.event?.doctorName) return params.event.doctorName
    if (doctorsList[0]?.name) return doctorsList[0].name
    return 'Sorumlu Diş Hekimi'
  }

  const formatTargetDisplay = (target: string): string => {
    if (target === 'upper') return 'Üst Çene'
    if (target === 'lower') return 'Alt Çene'
    if (target === 'general') return 'Tüm Ağız'
    if (/^[1-4][1-8]$/.test(target)) return `Diş #${target}`
    return target
  }

  const formatMoneyMinor = (minor: number): string =>
    `${(minor / 100).toLocaleString('tr-TR', {
      minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })} ₺`

  const groupedRows = Array.isArray(params.groupedRows) ? params.groupedRows : []
  const treatmentRows: OfficialConsentTreatmentRow[] = groupedRows.map((group: any) => {
    const item = group.primaryItem || {}
    const targets: string[] = Array.isArray(group.targets) && group.targets.length > 0
      ? group.targets
      : [group.primaryTarget || 'general']
    const toothLabel = targets.map(formatTargetDisplay).join(', ')
    const indications = Array.isArray(item.indications) && item.indications.length > 0
      ? item.indications.join(', ')
      : 'Klinik Muayene Bulgusu'

    const entriesCount = Array.isArray(group.entries) ? group.entries.length : 1
    const unitMinor =
      Math.round((Number(item.price) || 0) * 100) +
      (Array.isArray(item.materials) ? item.materials : []).reduce(
        (sum: number, m: any) =>
          sum + Math.max(1, Math.round(Number(m?.quantity) || 1)) * Math.max(0, Math.round(Number(m?.unitSalePriceMinor) || 0)),
        0
      )
    const totalMinor = unitMinor * Math.max(1, entriesCount)

    return {
      toothLabel,
      indications,
      procedureName: item.name || 'Diş Hekimliği Tedavisi',
      doctorName: resolveDoctorNames(item),
      amountFormatted: formatMoneyMinor(totalMinor),
      unitNote: entriesCount > 1 ? `${entriesCount} diş × ${formatMoneyMinor(unitMinor)}` : undefined,
    }
  })

  const primaryDoctor =
    treatmentRows[0]?.doctorName ||
    params.event?.doctorName ||
    doctorsList[0]?.name ||
    'Sorumlu Diş Hekimi'

  const rawProtocol = params.event?.patientId || params.patient?.id || ''
  const protocolNo = rawProtocol
    ? `ADS-${String(rawProtocol).slice(0, 8).toUpperCase()}`
    : `ADS-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`

  return {
    documentCode: 'ADSH.RB.01',
    publishDate: '01.01.2024',
    revisionNo: 'Rev.02',
    clinicName: 'Ağız ve Diş Sağlığı Polikliniği',
    patientName: params.patientName || params.patient?.name || 'Hasta',
    tcKimlikNo: params.patient?.tcKimlikNo || params.patient?.nationalId || '',
    protocolNo,
    birthDate: params.patient?.birthDate || params.patient?.dateOfBirth || '',
    phone: params.patient?.phone || params.event?.patientPhone || '',
    doctorName: primaryDoctor,
    dateTime: formattedDateTime,
    medicalConditions: 'Bilinen engelleyici akut sistemik durum beyan edilmedi.',
    allergies: 'Bilinen ilaç / lokal anestezik alerjisi beyan edilmedi.',
    medications: 'Düzenli kan sulandırıcı / kritik ilaç kullanımı beyan edilmedi.',
    pregnancyStatus: 'Yok / Uygulanamaz',
    specialNotes: '',
    guardianName: '',
    guardianRelation: '',
    witnessName: '',
    includeAllMinistryClauses: false,
    treatments: treatmentRows,
    subtotalFormatted: params.subtotalFormatted || '0 ₺',
    discountFormatted: params.discountFormatted || '0 ₺',
    totalFormatted: params.totalFormatted || '0 ₺',
  }
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildOfficialDentalConsentHtml(data: OfficialConsentDocumentData): string {
  const clauses = resolveRelevantConsentClauses(data.treatments, data.includeAllMinistryClauses)
  const docCode = escapeHtml(data.documentCode || 'ADSH.RB.01')
  const publishDate = escapeHtml(data.publishDate || '01.01.2024')
  const revisionNo = escapeHtml(data.revisionNo || 'Rev.02')

  const treatmentRowsHtml =
    data.treatments.length > 0
      ? data.treatments
          .map(
            (row, idx) => `
          <tr>
            <td style="text-align:center;font-weight:700;">${idx + 1}</td>
            <td style="font-weight:700;">${escapeHtml(row.toothLabel)}</td>
            <td>${escapeHtml(row.indications)}</td>
            <td style="font-weight:700;">${escapeHtml(row.procedureName)}</td>
            <td>${escapeHtml(row.doctorName)}</td>
            <td style="text-align:right;font-weight:700;">
              ${escapeHtml(row.amountFormatted)}
              ${row.unitNote ? `<div style="font-size:9px;color:#475569;font-weight:500;">(${escapeHtml(row.unitNote)})</div>` : ''}
            </td>
          </tr>`
          )
          .join('')
      : `<tr><td colspan="6" style="text-align:center;padding:10px;">Genel Diş Hekimliği Muayene ve Tedavi Planlaması</td></tr>`

  const clausesHtml = clauses
    .map(
      clause => `
      <div class="clause-box">
        <div class="clause-title">${escapeHtml(clause.code)} — ${escapeHtml(clause.title)}</div>
        <div class="clause-row"><strong>• İşlemin Amacı ve Uygulanacak Yöntem:</strong> ${escapeHtml(clause.purposeAndMethod)}</div>
        <div class="clause-row"><strong>• Alternatif Tedavi Seçenekleri:</strong> ${escapeHtml(clause.alternatives)}</div>
        <div class="clause-row"><strong>• İşlemin Olası Risk ve Komplikasyonları:</strong> ${escapeHtml(clause.risksAndComplications)}</div>
        <div class="clause-row"><strong>• Tedaviyi Reddetme / Erteleme Durumunda Olası Riskler:</strong> ${escapeHtml(clause.refusalConsequences)}</div>
        <div class="clause-row"><strong>• İşlem Sonrası Dikkat Edilmesi Gerekenler:</strong> ${escapeHtml(clause.postOpCare)}</div>
      </div>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <title>T.C. Sağlık Bakanlığı Uyumlu Diş Hekimliği Aydınlatılmış Onam (Rıza) Belgesi - ${escapeHtml(data.patientName)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      font-size: 10.5px;
      line-height: 1.38;
      color: #0f172a;
      background: #ffffff;
    }
    .page-wrap {
      max-width: 190mm;
      margin: 0 auto;
      padding: 2mm 0;
    }
    .ministry-header {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
      border: 1.5px solid #0f172a;
    }
    .ministry-header td {
      border: 1px solid #0f172a;
      padding: 5px 8px;
      vertical-align: middle;
    }
    .ministry-crest {
      width: 22%;
      text-align: center;
      background: #f8fafc;
    }
    .ministry-crest-badge {
      display: inline-block;
      padding: 3px 8px;
      border: 1.5px solid #b91c1c;
      border-radius: 4px;
      color: #b91c1c;
      font-weight: 800;
      font-size: 10px;
      letter-spacing: 0.04em;
      margin-bottom: 3px;
    }
    .ministry-title-cell {
      width: 54%;
      text-align: center;
      background: #f1f5f9;
    }
    .ministry-title-top {
      font-size: 10px;
      font-weight: 800;
      color: #1e3a8a;
      letter-spacing: 0.03em;
    }
    .ministry-title-main {
      font-size: 13px;
      font-weight: 900;
      color: #0f172a;
      margin: 2px 0;
    }
    .ministry-title-sub {
      font-size: 9.5px;
      font-weight: 600;
      color: #334155;
    }
    .ministry-meta-cell {
      width: 24%;
      font-size: 9.5px;
      padding: 0 !important;
    }
    .meta-inner {
      width: 100%;
      border-collapse: collapse;
    }
    .meta-inner td {
      border: none;
      border-bottom: 1px solid #cbd5e1;
      padding: 2.5px 6px;
    }
    .meta-inner tr:last-child td {
      border-bottom: none;
    }
    .legal-notice {
      padding: 5px 8px;
      margin-bottom: 7px;
      border: 1px solid #94a3b8;
      background: #f8fafc;
      font-size: 9.5px;
      color: #1e293b;
    }
    .section-banner {
      background: #1e3a8a;
      color: #ffffff;
      font-weight: 800;
      font-size: 10.5px;
      padding: 4px 8px;
      letter-spacing: 0.02em;
      border: 1px solid #0f172a;
      border-bottom: none;
      margin-top: 7px;
    }
    table.form-grid {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #0f172a;
    }
    table.form-grid th,
    table.form-grid td {
      border: 1px solid #475569;
      padding: 4px 6px;
      font-size: 10px;
      vertical-align: top;
    }
    table.form-grid th {
      background: #e2e8f0;
      color: #0f172a;
      font-weight: 800;
      text-align: left;
    }
    .field-label {
      font-weight: 700;
      color: #334155;
      width: 18%;
      background: #f8fafc;
    }
    .field-val {
      width: 32%;
      font-weight: 600;
      color: #0f172a;
    }
    .clause-container {
      border: 1px solid #0f172a;
      padding: 5px 7px;
      background: #ffffff;
    }
    .clause-box {
      border-bottom: 1px dashed #cbd5e1;
      padding: 4px 0;
    }
    .clause-box:last-child {
      border-bottom: none;
    }
    .clause-title {
      font-weight: 800;
      color: #1e3a8a;
      font-size: 10.2px;
      margin-bottom: 2px;
    }
    .clause-row {
      font-size: 9.6px;
      margin-bottom: 1.5px;
      text-align: justify;
    }
    .consent-declaration {
      border: 1px solid #0f172a;
      padding: 6px 8px;
      background: #f8fafc;
      font-size: 9.8px;
      text-align: justify;
    }
    .handwriting-box {
      margin-top: 6px;
      padding: 6px 8px;
      border: 1.5px dashed #334155;
      background: #ffffff;
    }
    .sig-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #0f172a;
      margin-top: 6px;
      page-break-inside: avoid;
    }
    .sig-table th {
      background: #e2e8f0;
      border: 1px solid #0f172a;
      padding: 4px 6px;
      font-size: 9.5px;
      font-weight: 800;
      text-align: center;
    }
    .sig-table td {
      border: 1px solid #0f172a;
      padding: 5px 6px;
      width: 25%;
      height: 78px;
      vertical-align: top;
      font-size: 9.5px;
    }
  </style>
</head>
<body>
  <div class="page-wrap">
    <table class="ministry-header">
      <tr>
        <td class="ministry-crest">
          <div class="ministry-crest-badge">T.C. SAĞLIK BAKANLIĞI SKS</div>
          <div style="font-weight:800;font-size:10px;color:#0f172a;">${escapeHtml(data.clinicName)}</div>
          <div style="font-size:8.5px;color:#475569;">Ağız ve Diş Sağlığı Hizmetleri</div>
        </td>
        <td class="ministry-title-cell">
          <div class="ministry-title-top">T.C. SAĞLIK BAKANLIĞI &amp; TDB STANDARTLARINA UYGUN</div>
          <div class="ministry-title-main">DİŞ HEKİMLİĞİ AYDINLATILMIŞ ONAM (RIZA) BELGESİ</div>
          <div class="ministry-title-sub">Genel Muayene, Lokal Anestezi ve Girişimsel Diş Tedavileri Hasta Rıza Formu</div>
        </td>
        <td class="ministry-meta-cell">
          <table class="meta-inner">
            <tr><td><strong>Doküman Kodu:</strong></td><td>${docCode}</td></tr>
            <tr><td><strong>Yayın Tarihi:</strong></td><td>${publishDate}</td></tr>
            <tr><td><strong>Revizyon No:</strong></td><td>${revisionNo}</td></tr>
            <tr><td><strong>Protokol No:</strong></td><td>${escapeHtml(data.protocolNo)}</td></tr>
          </table>
        </td>
      </tr>
    </table>

    <div class="legal-notice">
      <strong>YASAL DAYANAK VE BİLGİLENDİRME:</strong> Bu belge; 1219 sayılı Kanun (Madde 70), T.C. Sağlık Bakanlığı Hasta Hakları Yönetmeliği (Madde 22, 24 ve 31) ve Türk Dişhekimleri Birliği (TDB) Meslek Etiği Kuralları uyarınca, uygulanacak diş hekimliği müdahaleleri öncesinde hastanın tıbbi durumu, önerilen tedaviler, alternatifleri, olası risk/komplikasyonları ve tedaviyi reddetme sonuçları hakkında aydınlatıldığını ve özgür iradesiyle rıza gösterdiğini belgelemek amacıyla düzenlenmiştir.
    </div>

    <div class="section-banner">BÖLÜM 1 — HASTA VE SAĞLIK KURULUŞU KİMLİK BİLGİLERİ</div>
    <table class="form-grid">
      <tr>
        <td class="field-label">Hasta Adı Soyadı:</td>
        <td class="field-val">${escapeHtml(data.patientName)}</td>
        <td class="field-label">T.C. Kimlik / Pasaport No:</td>
        <td class="field-val">${escapeHtml(data.tcKimlikNo || '................................................')}</td>
      </tr>
      <tr>
        <td class="field-label">Doğum Tarihi / Yaşı:</td>
        <td class="field-val">${escapeHtml(data.birthDate || '................................................')}</td>
        <td class="field-label">Telefon Numarası:</td>
        <td class="field-val">${escapeHtml(data.phone || '................................................')}</td>
      </tr>
      <tr>
        <td class="field-label">Sorumlu Diş Hekimi:</td>
        <td class="field-val">${escapeHtml(data.doctorName)}</td>
        <td class="field-label">Düzenlenme Tarihi / Saati:</td>
        <td class="field-val">${escapeHtml(data.dateTime)}</td>
      </tr>
    </table>

    <div class="section-banner">BÖLÜM 2 — TIBBİ ANAMNEZ VE GENEL SAĞLIK BEYANI</div>
    <table class="form-grid">
      <tr>
        <td class="field-label">Sistemik Hastalıklar:</td>
        <td class="field-val">${escapeHtml(data.medicalConditions)}</td>
        <td class="field-label">İlaç / Anestezik Alerjisi:</td>
        <td class="field-val">${escapeHtml(data.allergies)}</td>
      </tr>
      <tr>
        <td class="field-label">Düzenli Kullanılan İlaçlar:</td>
        <td class="field-val">${escapeHtml(data.medications)}</td>
        <td class="field-label">Gebelik / Emzirme Durumu:</td>
        <td class="field-val">${escapeHtml(data.pregnancyStatus)}</td>
      </tr>
      ${
        data.specialNotes
          ? `<tr><td class="field-label">Hekim / Klinik Özel Notu:</td><td colspan="3" class="field-val">${escapeHtml(data.specialNotes)}</td></tr>`
          : ''
      }
    </table>

    <div class="section-banner">BÖLÜM 3 — PLANLANAN DİŞ HEKİMLİĞİ TANI VE TEDAVİ İŞLEMLERİ TABLOSU</div>
    <table class="form-grid">
      <thead>
        <tr>
          <th style="width:6%;text-align:center;">No</th>
          <th style="width:18%;">Diş No / Bölge (FDI)</th>
          <th style="width:24%;">Tanı / Endikasyon</th>
          <th style="width:24%;">Planlanan Tedavi / İşlem</th>
          <th style="width:15%;">Sorumlu Hekim</th>
          <th style="width:13%;text-align:right;">Tahmini Tutar</th>
        </tr>
      </thead>
      <tbody>
        ${treatmentRowsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" style="text-align:right;font-weight:700;background:#f8fafc;">
            Ara Toplam: ${escapeHtml(data.subtotalFormatted)}
            ${data.discountFormatted && data.discountFormatted !== '0 ₺' ? ` · Toplam İskonto: −${escapeHtml(data.discountFormatted)}` : ''}
            · <strong>GENEL TOPLAM:</strong>
          </td>
          <td style="text-align:right;font-weight:900;background:#f1f5f9;font-size:11px;">
            ${escapeHtml(data.totalFormatted)}
          </td>
        </tr>
      </tfoot>
    </table>

    <div class="section-banner">BÖLÜM 4 — UYGULANACAK İŞLEMLERE İLİŞKİN RESMİ TIBBİ AYDINLATMA MADDELERİ</div>
    <div class="clause-container">
      ${clausesHtml}
    </div>

    <div class="section-banner">BÖLÜM 5 — HASTA / YASAL TEMSİLCİ AYDINLATILMIŞ RIZA (ONAM) BEYANI VE İMZALAR</div>
    <div class="consent-declaration">
      <div>
        <strong>AYDINLATILMIŞ RIZA BEYANI:</strong> Yukarıda kimlik bilgileri yer alan ben (veya yasal temsilcisi olduğum hasta adına), diş hekimim <strong>${escapeHtml(data.doctorName)}</strong> tarafından yapılan klinik ve radyolojik muayene sonucunda tespit edilen tanı/endikasyonlar, Bölüm 3'te listelenen planlanan diş hekimliği tedavileri, uygulanacak lokal anestezi ve girişimsel işlemlerin amacı, yapılış yöntemi, alternatif tedavi seçenekleri, olası tıbbi risk ve komplikasyonları, işlem sonrası dikkat etmem gereken kurallar, tedavinin tahmini maliyeti ve tedaviyi reddetmem/ertelemem halinde oluşabilecek sağlık riskleri hakkında anlayabileceğim açık ve sade bir dille bilgilendirildim. Tedavi sürecinde klinik zorunluluk doğması halinde ek tanı/tedavi gereksinimlerinin tarafıma bildirileceğini biliyorum. Tüm sorularımı sorma imkanı buldum ve tatmin edici cevaplar aldım. Hiçbir baskı altında kalmadan, kendi hür irademle yukarıda belirtilen diş hekimliği tedavilerinin uygulanmasına <strong>ONAY VERİYORUM.</strong>
      </div>
      <div class="handwriting-box">
        <div style="font-size:9px;font-weight:800;color:#334155;margin-bottom:4px;">
          HASTA VEYA YASAL TEMSİLCİSİNİN EL YAZISIYLA BEYANI (Lütfen aşağıdaki noktalı alana kendi el yazınızla "Okudum, anladım, önerilen tedavinin uygulanmasını kabul ediyorum." yazınız):
        </div>
        <div style="height:22px;border-bottom:1px dotted #64748b;margin-top:6px;"></div>
      </div>
    </div>

    <table class="sig-table">
      <thead>
        <tr>
          <th>HASTA ADI SOYADI &amp; İMZA</th>
          <th>YASAL TEMSİLCİ (VELİ / VASİ)</th>
          <th>AYDINLATAN DİŞ HEKİMİ (KAŞE / İMZA)</th>
          <th>ŞAHİT / KLİNİK PERSONELİ</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div><strong>Adı Soyadı:</strong> ${escapeHtml(data.patientName)}</div>
            <div><strong>Tarih/Saat:</strong> ${escapeHtml(data.dateTime)}</div>
            <div style="margin-top:16px;color:#475569;"><strong>İmza:</strong></div>
          </td>
          <td>
            <div><strong>Adı Soyadı:</strong> ${escapeHtml(data.guardianName || '................................')}</div>
            <div><strong>Yakınlığı:</strong> ${escapeHtml(data.guardianRelation || '................................')}</div>
            <div style="margin-top:16px;color:#475569;"><strong>İmza:</strong></div>
          </td>
          <td>
            <div><strong>Hekim:</strong> ${escapeHtml(data.doctorName)}</div>
            <div><strong>Tarih/Saat:</strong> ${escapeHtml(data.dateTime)}</div>
            <div style="margin-top:16px;color:#475569;"><strong>Kaşe ve İmza:</strong></div>
          </td>
          <td>
            <div><strong>Adı Soyadı:</strong> ${escapeHtml(data.witnessName || '................................')}</div>
            <div><strong>Tarih/Saat:</strong> ${escapeHtml(data.dateTime)}</div>
            <div style="margin-top:16px;color:#475569;"><strong>İmza:</strong></div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>`
}

export function printOfficialDentalConsent(data: OfficialConsentDocumentData): boolean {
  if (typeof window === 'undefined') return false
  const html = buildOfficialDentalConsentHtml(data)

  const printWin = window.open('', '_blank', 'width=940,height=960,scrollbars=yes,resizable=yes')
  if (printWin) {
    printWin.document.open()
    printWin.document.write(html)
    printWin.document.close()
    printWin.focus()
    setTimeout(() => {
      try {
        printWin.focus()
        printWin.print()
      } catch {
        // Ignore if user closed early
      }
    }, 280)
    return true
  }

  // Fallback hidden iframe if popup is blocked by browser settings
  try {
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(html)
      doc.close()
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
        } finally {
          setTimeout(() => iframe.remove(), 2000)
        }
      }, 300)
      return true
    }
  } catch {
    return false
  }
  return false
}

function wrapCanvasParagraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let current = words[0]
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate
    } else {
      lines.push(current)
      current = words[i]
    }
  }
  lines.push(current)
  return lines
}

function renderConsentPagesToJpegDataUrls(data: OfficialConsentDocumentData): {
  width: number
  height: number
  pages: Uint8Array[]
} {
  const PAGE_W = 1488
  const PAGE_H = 2105
  const MARGIN_X = 68
  const CONTENT_W = PAGE_W - MARGIN_X * 2
  const BOTTOM_LIMIT = PAGE_H - 95

  const canvases: HTMLCanvasElement[] = []
  let currentCanvas!: HTMLCanvasElement
  let ctx!: CanvasRenderingContext2D
  let cursorY = 64

  const createNewPage = (pageIndex: number) => {
    const c = document.createElement('canvas')
    c.width = PAGE_W
    c.height = PAGE_H
    const context = c.getContext('2d')
    if (!context) {
      throw new Error('Canvas 2D context unavailable')
    }
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, PAGE_W, PAGE_H)

    // Outer page frame
    context.strokeStyle = '#cbd5e1'
    context.lineWidth = 1.5
    context.strokeRect(42, 42, PAGE_W - 84, PAGE_H - 84)

    // Ministry Header Box
    const headerY = 60
    const headerH = 112
    context.fillStyle = '#f8fafc'
    context.fillRect(MARGIN_X, headerY, CONTENT_W, headerH)
    context.strokeStyle = '#0f172a'
    context.lineWidth = 2
    context.strokeRect(MARGIN_X, headerY, CONTENT_W, headerH)

    const col1W = Math.round(CONTENT_W * 0.23)
    const col2W = Math.round(CONTENT_W * 0.53)
    const col3X = MARGIN_X + col1W + col2W

    context.beginPath()
    context.moveTo(MARGIN_X + col1W, headerY)
    context.lineTo(MARGIN_X + col1W, headerY + headerH)
    context.moveTo(col3X, headerY)
    context.lineTo(col3X, headerY + headerH)
    context.stroke()

    // Col 1: Ministry badge & clinic name
    context.strokeStyle = '#b91c1c'
    context.lineWidth = 2
    context.strokeRect(MARGIN_X + 18, headerY + 16, col1W - 36, 28)
    context.fillStyle = '#b91c1c'
    context.font = 'bold 15px Inter, Arial, sans-serif'
    context.textAlign = 'center'
    context.fillText('T.C. SAĞLIK BAKANLIĞI SKS', MARGIN_X + col1W / 2, headerY + 35)

    context.fillStyle = '#0f172a'
    context.font = 'bold 16px Inter, Arial, sans-serif'
    context.fillText(data.clinicName || 'Ağız ve Diş Sağlığı Kliniği', MARGIN_X + col1W / 2, headerY + 66)
    context.fillStyle = '#475569'
    context.font = '14px Inter, Arial, sans-serif'
    context.fillText('Ağız ve Diş Sağlığı Hizmetleri', MARGIN_X + col1W / 2, headerY + 90)

    // Col 2: Main Title
    const centerColX = MARGIN_X + col1W + col2W / 2
    context.fillStyle = '#1e3a8a'
    context.font = 'bold 15px Inter, Arial, sans-serif'
    context.fillText('T.C. SAĞLIK BAKANLIĞI & TDB STANDARTLARINA UYGUN', centerColX, headerY + 32)
    context.fillStyle = '#0f172a'
    context.font = 'bold 21px Inter, Arial, sans-serif'
    context.fillText('DİŞ HEKİMLİĞİ AYDINLATILMIŞ ONAM (RIZA) BELGESİ', centerColX, headerY + 64)
    context.fillStyle = '#334155'
    context.font = '600 14px Inter, Arial, sans-serif'
    context.fillText('Genel Muayene, Lokal Anestezi ve Girişimsel Diş Tedavileri Hasta Rıza Formu', centerColX, headerY + 92)

    // Col 3: SKS Metadata
    context.textAlign = 'left'
    const metaRows = [
      ['Doküman Kodu:', data.documentCode || 'ADSH.RB.01'],
      ['Yayın Tarihi:', data.publishDate || '01.01.2024'],
      ['Revizyon No:', data.revisionNo || 'Rev.02'],
      ['Protokol No:', data.protocolNo || 'ADS-2025'],
    ]
    metaRows.forEach(([label, val], idx) => {
      const ry = headerY + 23 + idx * 25
      if (idx > 0) {
        context.strokeStyle = '#cbd5e1'
        context.lineWidth = 1
        context.beginPath()
        context.moveTo(col3X, ry - 17)
        context.lineTo(MARGIN_X + CONTENT_W, ry - 17)
        context.stroke()
      }
      context.fillStyle = '#334155'
      context.font = 'bold 13.5px Inter, Arial, sans-serif'
      context.fillText(label, col3X + 10, ry)
      context.fillStyle = '#0f172a'
      context.font = '600 13.5px Inter, Arial, sans-serif'
      context.fillText(String(val), col3X + 125, ry)
    })

    canvases.push(c)
    currentCanvas = c
    ctx = context
    cursorY = headerY + headerH + 14

    if (pageIndex > 0) {
      ctx.fillStyle = '#475569'
      ctx.font = 'italic 14px Inter, Arial, sans-serif'
      ctx.fillText(`Hasta: ${data.patientName} — Aydınlatılmış Onam (Rıza) Belgesi (Devam Sayfası)`, MARGIN_X, cursorY + 14)
      cursorY += 26
    }
  }

  const ensureSpace = (neededHeight: number) => {
    if (cursorY + neededHeight > BOTTOM_LIMIT) {
      createNewPage(canvases.length)
    }
  }

  const drawSectionBanner = (title: string) => {
    ensureSpace(55)
    ctx.fillStyle = '#1e3a8a'
    ctx.fillRect(MARGIN_X, cursorY, CONTENT_W, 32)
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 1.5
    ctx.strokeRect(MARGIN_X, cursorY, CONTENT_W, 32)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 15.5px Inter, Arial, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(title, MARGIN_X + 12, cursorY + 22)
    cursorY += 32
  }

  const drawKeyValueGrid = (rows: Array<[string, string, string, string]>) => {
    const rowH = 34
    ensureSpace(rows.length * rowH + 10)
    const w1 = Math.round(CONTENT_W * 0.19)
    const w2 = Math.round(CONTENT_W * 0.31)
    const w3 = Math.round(CONTENT_W * 0.19)
    const w4 = CONTENT_W - w1 - w2 - w3

    rows.forEach(([l1, v1, l2, v2]) => {
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(MARGIN_X, cursorY, w1, rowH)
      ctx.fillRect(MARGIN_X + w1 + w2, cursorY, w3, rowH)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(MARGIN_X + w1, cursorY, w2, rowH)
      ctx.fillRect(MARGIN_X + w1 + w2 + w3, cursorY, w4, rowH)

      ctx.strokeStyle = '#475569'
      ctx.lineWidth = 1.2
      ctx.strokeRect(MARGIN_X, cursorY, w1, rowH)
      ctx.strokeRect(MARGIN_X + w1, cursorY, w2, rowH)
      ctx.strokeRect(MARGIN_X + w1 + w2, cursorY, w3, rowH)
      ctx.strokeRect(MARGIN_X + w1 + w2 + w3, cursorY, w4, rowH)

      ctx.fillStyle = '#334155'
      ctx.font = 'bold 14px Inter, Arial, sans-serif'
      ctx.fillText(l1, MARGIN_X + 8, cursorY + 22)
      ctx.fillText(l2, MARGIN_X + w1 + w2 + 8, cursorY + 22)

      ctx.fillStyle = '#0f172a'
      ctx.font = '600 14px Inter, Arial, sans-serif'
      ctx.fillText(String(v1 || '................................').slice(0, 38), MARGIN_X + w1 + 8, cursorY + 22)
      ctx.fillText(String(v2 || '................................').slice(0, 38), MARGIN_X + w1 + w2 + w3 + 8, cursorY + 22)
      cursorY += rowH
    })
    cursorY += 10
  }

  // Initialize Page 1
  createNewPage(0)

  // Legal Notice Box
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(MARGIN_X, cursorY, CONTENT_W, 56)
  ctx.strokeStyle = '#64748b'
  ctx.lineWidth = 1.2
  ctx.strokeRect(MARGIN_X, cursorY, CONTENT_W, 56)
  ctx.fillStyle = '#1e293b'
  ctx.font = '600 13.5px Inter, Arial, sans-serif'
  const legalLines = wrapCanvasParagraph(
    ctx,
    'YASAL DAYANAK: 1219 sayılı Kanun (Madde 70), T.C. Sağlık Bakanlığı Hasta Hakları Yönetmeliği (Madde 22, 24, 31) ve TDB Meslek Etiği Kuralları gereğince; diş hekimliği girişimsel işlemlerine başlamadan önce hastanın önerilen tedaviler, alternatifler, riskler ve reddetme sonuçları hakkında bilgilendirildiğini ve özgür iradesiyle rıza verdiğini belgeleyen resmi formdur.',
    CONTENT_W - 20
  )
  legalLines.slice(0, 2).forEach((line, idx) => {
    ctx.fillText(line, MARGIN_X + 10, cursorY + 22 + idx * 20)
  })
  cursorY += 66

  // Section 1: Patient & Clinic Info
  drawSectionBanner('BÖLÜM 1 — HASTA VE SAĞLIK KURULUŞU KİMLİK BİLGİLERİ')
  drawKeyValueGrid([
    ['Hasta Adı Soyadı:', data.patientName, 'T.C. Kimlik No:', data.tcKimlikNo || '................................'],
    ['Doğum Tarihi / Yaşı:', data.birthDate || '................................', 'Telefon Numarası:', data.phone || '................................'],
    ['Sorumlu Diş Hekimi:', data.doctorName, 'Tarih ve Saat:', data.dateTime],
  ])

  // Section 2: Medical History
  drawSectionBanner('BÖLÜM 2 — TIBBİ ANAMNEZ VE GENEL SAĞLIK BEYANI')
  drawKeyValueGrid([
    ['Sistemik Hastalıklar:', data.medicalConditions, 'İlaç / Anestezik Alerjisi:', data.allergies],
    ['Kullanılan İlaçlar:', data.medications, 'Gebelik / Emzirme:', data.pregnancyStatus],
  ])

  // Section 3: Planned Treatments Table
  drawSectionBanner('BÖLÜM 3 — PLANLANAN DİŞ HEKİMLİĞİ TANI VE TEDAVİ İŞLEMLERİ TABLOSU')
  const colWidths = [
    Math.round(CONTENT_W * 0.06),
    Math.round(CONTENT_W * 0.19),
    Math.round(CONTENT_W * 0.23),
    Math.round(CONTENT_W * 0.24),
    Math.round(CONTENT_W * 0.15),
  ]
  colWidths.push(CONTENT_W - colWidths.reduce((a, b) => a + b, 0))
  const headers = ['No', 'Diş No / Bölge', 'Tanı / Endikasyon', 'Planlanan Tedavi / İşlem', 'Sorumlu Hekim', 'Tahmini Tutar']

  const drawTreatmentTableHeader = () => {
    const thH = 32
    ctx.fillStyle = '#e2e8f0'
    ctx.fillRect(MARGIN_X, cursorY, CONTENT_W, thH)
    let cx = MARGIN_X
    headers.forEach((h, i) => {
      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth = 1.2
      ctx.strokeRect(cx, cursorY, colWidths[i], thH)
      ctx.fillStyle = '#0f172a'
      ctx.font = 'bold 13.5px Inter, Arial, sans-serif'
      ctx.textAlign = i === 5 ? 'right' : i === 0 ? 'center' : 'left'
      const tx = i === 5 ? cx + colWidths[i] - 8 : i === 0 ? cx + colWidths[i] / 2 : cx + 8
      ctx.fillText(h, tx, cursorY + 21)
      cx += colWidths[i]
    })
    ctx.textAlign = 'left'
    cursorY += thH
  }

  drawTreatmentTableHeader()

  const rowsToRender =
    data.treatments.length > 0
      ? data.treatments
      : [
          {
            toothLabel: 'Tüm Ağız',
            indications: 'Klinik Muayene',
            procedureName: 'Genel Diş Hekimliği Muayene ve Tedavi Planı',
            doctorName: data.doctorName,
            amountFormatted: data.totalFormatted || '0 ₺',
          },
        ]

  rowsToRender.forEach((row, index) => {
    const trH = 34
    if (cursorY + trH > BOTTOM_LIMIT) {
      createNewPage(canvases.length)
      drawTreatmentTableHeader()
    }
    ctx.fillStyle = index % 2 === 0 ? '#ffffff' : '#f8fafc'
    ctx.fillRect(MARGIN_X, cursorY, CONTENT_W, trH)
    const cells = [
      String(index + 1),
      row.toothLabel,
      row.indications,
      row.procedureName,
      row.doctorName,
      row.amountFormatted,
    ]
    let cx = MARGIN_X
    cells.forEach((cellText, i) => {
      ctx.strokeStyle = '#475569'
      ctx.lineWidth = 1
      ctx.strokeRect(cx, cursorY, colWidths[i], trH)
      ctx.fillStyle = '#0f172a'
      ctx.font = i === 1 || i === 3 || i === 5 ? 'bold 13.5px Inter, Arial, sans-serif' : '13.5px Inter, Arial, sans-serif'
      ctx.textAlign = i === 5 ? 'right' : i === 0 ? 'center' : 'left'
      const tx = i === 5 ? cx + colWidths[i] - 8 : i === 0 ? cx + colWidths[i] / 2 : cx + 8
      ctx.fillText(String(cellText || '').slice(0, 32), tx, cursorY + 22)
      cx += colWidths[i]
    })
    ctx.textAlign = 'left'
    cursorY += trH
  })

  // Total Footer Row
  ensureSpace(44)
  ctx.fillStyle = '#f1f5f9'
  ctx.fillRect(MARGIN_X, cursorY, CONTENT_W, 34)
  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 1.4
  ctx.strokeRect(MARGIN_X, cursorY, CONTENT_W, 34)
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 14.5px Inter, Arial, sans-serif'
  ctx.textAlign = 'right'
  const summaryText = `Ara Toplam: ${data.subtotalFormatted}${
    data.discountFormatted && data.discountFormatted !== '0 ₺' ? `  |  İskonto: −${data.discountFormatted}` : ''
  }  |  GENEL TOPLAM: ${data.totalFormatted}`
  ctx.fillText(summaryText, MARGIN_X + CONTENT_W - 12, cursorY + 22)
  ctx.textAlign = 'left'
  cursorY += 44

  // Section 4: Ministry Clauses
  const clauses = resolveRelevantConsentClauses(data.treatments, data.includeAllMinistryClauses)
  drawSectionBanner('BÖLÜM 4 — UYGULANACAK İŞLEMLERE İLİŞKİN RESMİ TIBBİ AYDINLATMA MADDELERİ')

  clauses.forEach(clause => {
    ctx.font = '13px Inter, Arial, sans-serif'
    const bulletItems = [
      `• Amaç ve Yöntem: ${clause.purposeAndMethod}`,
      `• Alternatif Tedaviler: ${clause.alternatives}`,
      `• Olası Risk ve Komplikasyonlar: ${clause.risksAndComplications}`,
      `• Tedaviyi Reddetme Durumunda Riskler: ${clause.refusalConsequences}`,
    ]
    const wrappedBullets = bulletItems.flatMap(item => wrapCanvasParagraph(ctx, item, CONTENT_W - 24))
    const boxH = 30 + wrappedBullets.length * 18 + 8

    ensureSpace(boxH + 6)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(MARGIN_X, cursorY, CONTENT_W, boxH)
    ctx.strokeStyle = '#475569'
    ctx.lineWidth = 1
    ctx.strokeRect(MARGIN_X, cursorY, CONTENT_W, boxH)

    ctx.fillStyle = '#1e3a8a'
    ctx.font = 'bold 14px Inter, Arial, sans-serif'
    ctx.fillText(`${clause.code} — ${clause.title}`, MARGIN_X + 10, cursorY + 20)

    ctx.fillStyle = '#0f172a'
    ctx.font = '13px Inter, Arial, sans-serif'
    wrappedBullets.forEach((line, lIdx) => {
      ctx.fillText(line, MARGIN_X + 12, cursorY + 40 + lIdx * 18)
    })
    cursorY += boxH
  })
  cursorY += 10

  // Section 5: Patient Declaration & Wet Signatures
  ensureSpace(320)
  drawSectionBanner('BÖLÜM 5 — HASTA / YASAL TEMSİLCİ AYDINLATILMIŞ RIZA (ONAM) BEYANI VE İMZALAR')

  const declText =
    `Yukarıda kimlik bilgileri yer alan ben (veya yasal temsilcisi olduğum hasta adına), diş hekimim ${data.doctorName} tarafından muayenem sonucunda tespit edilen tanı ve endikasyonlar, Bölüm 3'te listelenen planlanan diş tedavileri, uygulanacak lokal anestezi ve girişimsel işlemlerin amacı, yöntemi, alternatifleri, olası tıbbi risk/komplikasyonları, tahmini maliyeti ve tedaviyi reddetmem halinde oluşabilecek riskler hakkında açık ve anlaşılır bir dille bilgilendirildim. Tüm sorularım yanıtlandı. Hiçbir baskı altında kalmadan, kendi hür irademle önerilen tedavilerin uygulanmasına ONAY VERİYORUM.`

  ctx.font = '13.5px Inter, Arial, sans-serif'
  const declLines = wrapCanvasParagraph(ctx, declText, CONTENT_W - 24)
  const declBoxH = declLines.length * 19 + 86

  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(MARGIN_X, cursorY, CONTENT_W, declBoxH)
  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 1.4
  ctx.strokeRect(MARGIN_X, cursorY, CONTENT_W, declBoxH)

  ctx.fillStyle = '#0f172a'
  ctx.font = '13.5px Inter, Arial, sans-serif'
  declLines.forEach((line, idx) => {
    ctx.fillText(line, MARGIN_X + 12, cursorY + 22 + idx * 19)
  })

  // Handwriting box inside declaration
  const hwY = cursorY + declLines.length * 19 + 16
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(MARGIN_X + 12, hwY, CONTENT_W - 24, 56)
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 1.2
  ctx.strokeRect(MARGIN_X + 12, hwY, CONTENT_W - 24, 56)
  ctx.fillStyle = '#334155'
  ctx.font = 'bold 12.5px Inter, Arial, sans-serif'
  ctx.fillText(
    'HASTA EL YAZISI BEYANI ("Okudum, anladım, önerilen tedavinin uygulanmasını kendi hür irademle kabul ediyorum."):',
    MARGIN_X + 20,
    hwY + 20
  )
  ctx.strokeStyle = '#94a3b8'
  ctx.beginPath()
  ctx.moveTo(MARGIN_X + 20, hwY + 46)
  ctx.lineTo(MARGIN_X + CONTENT_W - 32, hwY + 46)
  ctx.stroke()

  cursorY += declBoxH + 10

  // 4-Column Signature Block
  const sigW = Math.floor(CONTENT_W / 4)
  const sigH = 128
  const sigTitles = [
    'HASTA ADI SOYADI & İMZA',
    'YASAL TEMSİLCİ (VELİ/VASİ)',
    'AYDINLATAN DİŞ HEKİMİ',
    'ŞAHİT / KLİNİK PERSONELİ',
  ]
  const sigDetails = [
    [`Ad Soyad: ${data.patientName}`, `Tarih: ${data.dateTime}`, 'İmza:'],
    [`Ad Soyad: ${data.guardianName || '.........................'}`, `Yakınlık: ${data.guardianRelation || '.........................'}`, 'İmza:'],
    [`Hekim: ${data.doctorName}`, `Tarih: ${data.dateTime}`, 'Kaşe ve İmza:'],
    [`Ad Soyad: ${data.witnessName || '.........................'}`, `Tarih: ${data.dateTime}`, 'İmza:'],
  ]

  sigTitles.forEach((title, i) => {
    const sx = MARGIN_X + i * sigW
    const sw = i === 3 ? CONTENT_W - sigW * 3 : sigW
    ctx.fillStyle = '#e2e8f0'
    ctx.fillRect(sx, cursorY, sw, 28)
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 1.2
    ctx.strokeRect(sx, cursorY, sw, 28)
    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 12.5px Inter, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(title, sx + sw / 2, cursorY + 19)

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(sx, cursorY + 28, sw, sigH)
    ctx.strokeRect(sx, cursorY + 28, sw, sigH)

    ctx.textAlign = 'left'
    ctx.fillStyle = '#0f172a'
    ctx.font = '600 13px Inter, Arial, sans-serif'
    ctx.fillText(sigDetails[i][0].slice(0, 28), sx + 10, cursorY + 52)
    ctx.fillText(sigDetails[i][1].slice(0, 28), sx + 10, cursorY + 74)
    ctx.fillStyle = '#475569'
    ctx.font = 'bold 13px Inter, Arial, sans-serif'
    ctx.fillText(sigDetails[i][2], sx + 10, cursorY + 102)
  })

  // Stamp Page Numbers ("Sayfa X / N") on all pages
  const totalPages = canvases.length
  const jpegPages: Uint8Array[] = []

  canvases.forEach((canvas, idx) => {
    const c = canvas.getContext('2d')
    if (c) {
      c.fillStyle = '#475569'
      c.font = 'bold 13px Inter, Arial, sans-serif'
      c.textAlign = 'right'
      c.fillText(
        `T.C. Sağlık Bakanlığı Uyumlu Aydınlatılmış Onam Belgesi · Sayfa ${idx + 1} / ${totalPages}`,
        PAGE_W - MARGIN_X,
        PAGE_H - 54
      )
    }
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    const base64 = dataUrl.split(',')[1] || ''
    const binaryStr = typeof atob === 'function' ? atob(base64) : ''
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    jpegPages.push(bytes)
  })

  return { width: PAGE_W, height: PAGE_H, pages: jpegPages }
}

function buildPdfBinaryFromJpegPages(
  width: number,
  height: number,
  jpegPages: Uint8Array[]
): Uint8Array {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  let byteOffset = 0

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes)
    byteOffset += bytes.byteLength
  }

  const pushStr = (str: string) => {
    pushBytes(encoder.encode(str))
  }

  // Object numbering:
  // 1: Catalog
  // 2: Pages
  // For each page p (0..N-1):
  //   pageObj = 3 + p * 3
  //   contentObj = 4 + p * 3
  //   imageObj = 5 + p * 3
  const pageCount = jpegPages.length
  const totalObjects = 2 + pageCount * 3
  const offsets: number[] = new Array(totalObjects + 1).fill(0)

  pushStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')

  // Obj 1: Catalog
  offsets[1] = byteOffset
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')

  // Obj 2: Pages
  const kidsRefs = jpegPages.map((_, idx) => `${3 + idx * 3} 0 R`).join(' ')
  offsets[2] = byteOffset
  pushStr(`2 0 obj\n<< /Type /Pages /Kids [ ${kidsRefs} ] /Count ${pageCount} >>\nendobj\n`)

  for (let i = 0; i < pageCount; i++) {
    const pageObjId = 3 + i * 3
    const contentObjId = 4 + i * 3
    const imageObjId = 5 + i * 3
    const jpegBytes = jpegPages[i]

    // Page object (A4 points: 595.28 x 841.89)
    offsets[pageObjId] = byteOffset
    pushStr(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im${i} ${imageObjId} 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`
    )

    // Content stream object
    const streamCmd = `q\n595.28 0 0 841.89 0 0 cm\n/Im${i} Do\nQ\n`
    offsets[contentObjId] = byteOffset
    pushStr(
      `${contentObjId} 0 obj\n<< /Length ${streamCmd.length} >>\nstream\n${streamCmd}endstream\nendobj\n`
    )

    // Image XObject (DCTDecode)
    offsets[imageObjId] = byteOffset
    pushStr(
      `${imageObjId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.byteLength} >>\nstream\n`
    )
    pushBytes(jpegBytes)
    pushStr('\nendstream\nendobj\n')
  }

  const xrefOffset = byteOffset
  pushStr(`xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`)
  for (let objId = 1; objId <= totalObjects; objId++) {
    const padded = String(offsets[objId]).padStart(10, '0')
    pushStr(`${padded} 00000 n \n`)
  }

  pushStr(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  )

  const output = new Uint8Array(byteOffset)
  let pos = 0
  for (const chunk of chunks) {
    output.set(chunk, pos)
    pos += chunk.byteLength
  }
  return output
}

function buildFallbackTextPdfBinary(data: OfficialConsentDocumentData): Uint8Array {
  const encoder = new TextEncoder()
  const safeAscii = (text: string) =>
    String(text || '')
      .replace(/ğ/g, 'g')
      .replace(/Ğ/g, 'G')
      .replace(/ü/g, 'u')
      .replace(/Ü/g, 'U')
      .replace(/ş/g, 's')
      .replace(/Ş/g, 'S')
      .replace(/ı/g, 'i')
      .replace(/İ/g, 'I')
      .replace(/ö/g, 'o')
      .replace(/Ö/g, 'O')
      .replace(/ç/g, 'c')
      .replace(/Ç/g, 'C')
      .replace(/₺/g, 'TL')
      .replace(/[()\\]/g, '')

  const stream = `BT /F1 12 Tf 45 790 Td (T.C. SAGLIK BAKANLIGI DIS HEKIMLIGI AYDINLATILMIS RIZA BELGESI) Tj 0 -22 Td (Hasta: ${safeAscii(data.patientName)} - Hekim: ${safeAscii(data.doctorName)}) Tj 0 -20 Td (Toplam: ${safeAscii(data.totalFormatted)}) Tj ET`
  const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length ${stream.length} >> stream
${stream}
endstream endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000229 00000 n 
0000000297 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
${350 + stream.length}
%%EOF`
  return encoder.encode(pdf)
}

export function sanitizeConsentFileName(patientName: string): string {
  const clean = (patientName || 'Hasta')
    .trim()
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `TC_Saglik_Bakanligi_Aydinlatilmis_Riza_Belgesi_${clean || 'Hasta'}.pdf`
}

export function downloadOfficialDentalConsentPdf(data: OfficialConsentDocumentData): string {
  const fileName = sanitizeConsentFileName(data.patientName)
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fileName
  }

  let pdfBytes: Uint8Array
  try {
    const rendered = renderConsentPagesToJpegDataUrls(data)
    if (rendered.pages.length > 0 && rendered.pages[0].byteLength > 0) {
      pdfBytes = buildPdfBinaryFromJpegPages(rendered.width, rendered.height, rendered.pages)
    } else {
      pdfBytes = buildFallbackTextPdfBinary(data)
    }
  } catch {
    pdfBytes = buildFallbackTextPdfBinary(data)
  }

  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  setTimeout(() => {
    link.remove()
    URL.revokeObjectURL(url)
  }, 1500)

  return fileName
}
