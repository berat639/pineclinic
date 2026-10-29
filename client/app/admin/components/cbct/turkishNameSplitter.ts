/**
 * ============================================================================
 * TÜRKÇE HASTA ADI & SOYADI GÖRSEL AYIRICI (src/turkishNameSplitter.ts)
 * ============================================================================
 * Bazı CBCT cihaz yazılımları (özellikle Meyer / MyDentViewer) DICOM (0010,0010)
 * PatientName etiketini dışa aktarırken boşlukları ve '^' ayraçlarını silerek
 * bitişik büyük harfli tek bir dizge halinde kaydeder:
 *   - "HACIAHMETKARAHAN"  -> "HACI AHMET KARAHAN"
 *   - "MEHMETFERHATOZCAN" -> "MEHMET FERHAT OZCAN"
 *   - "SERGENGUNEY"       -> "SERGEN GUNEY"
 *
 * Bu modül ham veriyi değiştirmeden, yalnızca arayüz gösteriminde:
 *   [1. Ad] + [2. Ad (varsa)] + [Soyad (her zaman son parça)]
 * kuralına göre bitişik Türkçe kişi adlarını otomatik olarak ayırır.
 * ============================================================================
 */

const TR_GIVEN_NAMES = new Set<string>([
  // Erkek ve yaygın ortak ilk adlar (DICOM ASCII normalize)
  'ABBAS', 'ABDULKADIR', 'ABDULLAH', 'ABDULKERIM', 'ABDURRAHMAN', 'ABDULAZIZ', 'ABDULHAMIT', 'ABDULSAMET',
  'ADEM', 'ADIL', 'ADNAN', 'AHMET', 'AKIF', 'AKIN', 'ALAATTIN', 'ALI', 'ALIHAN', 'ALIM', 'ALP', 'ALPARSLAN',
  'ALPER', 'ALPEREN', 'ALTAN', 'ALTAY', 'ANIL', 'ARDA', 'ARIF', 'ARMAĞAN', 'ARMAGAN', 'ASIM', 'ASLAN',
  'ATA', 'ATAKAN', 'ATALAY', 'ATILLA', 'ATILIM', 'AYAZ', 'AYBERK', 'AYDIN', 'AYHAN', 'AYKUT', 'AYTEK',
  'AYTUG', 'AZIZ', 'BAHADIR', 'RIYAZ', 'BAHTIYAR', 'BAKI', 'BARAN', 'BARIS', 'BARTU', 'BASRI', 'BATU',
  'BATUHAN', 'BATUR', 'BAYRAM', 'BEDIRHAN', 'BEDRI', 'BEHCET', 'BEKIR', 'BERAT', 'BERK', 'BERKAN', 'BERKAY',
  'BERKE', 'BESIR', 'BEYTULLAH', 'BILAL', 'BILGEHAN', 'BIROL', 'BORA', 'BUGRA', 'BULENT', 'BUNYAMIN',
  'BURAK', 'BURC', 'BURHAN', 'CABBAR', 'CAFER', 'CAHIT', 'CAN', 'CANBERK', 'CANER', 'CANKAT', 'CELAL',
  'CELIL', 'CEM', 'CEMAL', 'CEMIL', 'CENGIZ', 'CENGIZHAN', 'CENK', 'CETIN', 'CEVDET', 'CEVHER', 'CEYHUN',
  'CIHAN', 'CIHANGIR', 'CIHAT', 'COSKUN', 'CUMA', 'CUMALI', 'CUNEYT', 'CAGDAS', 'CAGLAR', 'CAGRI', 'CINAR',
  'DAVUT', 'DEMIR', 'DENIZ', 'DERVIS', 'DEVRIM', 'DILAVER', 'DINCER', 'DOGA', 'DOGAN', 'DOGUKAN', 'DORUK',
  'DURSUN', 'DURMUS', 'EBUBEKIR', 'ECEVIT', 'EDIP', 'EFE', 'EFKAN', 'EGE', 'EGEMEN', 'EKIN', 'EKREM',
  'EMIN', 'EMIR', 'EMIRHAN', 'EMRAH', 'EMRE', 'ENDER', 'ENES', 'ENGIN', 'ENIS', 'ENSAR', 'ENVER', 'oguz',
  'ERAY', 'ERCAN', 'ERDAL', 'ERDEM', 'ERDI', 'ERDINC', 'ERDOGAN', 'EREN', 'ERGIN', 'ERGUN', 'ERHAN',
  'ERKAN', 'ERMAN', 'EROL', 'ERSAN', 'ERSIN', 'ERSOY', 'ERTAN', 'ERTUGRUL', 'ERTURK', 'ESAT', 'ESREF',
  'ETHEM', 'EVREN', 'EYMEN', 'EYUP', 'EZEL', 'FADIL', 'FAHRETTIN', 'FAHRI', 'FAIK', 'FARUK', 'FATIH',
  'FAZIL', 'FEHMI', 'FERDI', 'FERHAT', 'FERIDUN', 'FERIT', 'FETHI', 'FEVZI', 'FEYYAZ', 'FEYZULLAH',
  'FIKRET', 'FIKRI', 'FIRAT', 'FUAT', 'FURKAN', 'GALIP', 'GAZI', 'GENCAY', 'GIRAY', 'GOKALP', 'GOKAY',
  'GOKBERK', 'GOKCE', 'GOKCEN', 'GOKHAN', 'GOKMEN', 'GOKSEL', 'GOKTUG', 'GOKTURK', 'GORKEM', 'GULTEKIN',
  'GVEN', 'GUVEN', 'GURAY', 'GURBUZ', 'GURKAN', 'GURSEL', 'HABIP', 'HACI', 'HAKAN', 'ismet', 'HAKKI',
  'HALDUN', 'HALIL', 'HALIM', 'HALIS', 'HALIT', 'HALUK', 'HAMDI', 'HAMIT', 'HAMZA', 'HARUN', 'HASAN',
  'HASIM', 'HATIP', 'HAYDAR', 'HAYRETTIN', 'HAYRI', 'HAYRULLAH', 'HIDAYET', 'HIKMET', 'HILMI', 'HIZIR',
  'HULUSI', 'HURSIT', 'HUSEYIN', 'HUSNU', 'IBRAHIM', 'IDRIS', 'IHSAN', 'ILHAN', 'ILKAY', 'ILKER', 'ILHAMI',
  'ILYAS', 'IMDAT', 'IRFAN', 'ISA', 'ISHAK', 'ISKENDER', 'ISMAIL', 'ISMET', 'IZZET', 'Kaan', 'KAAN',
  'KADIR', 'KADRI', 'KAGAN', 'KAMIL', 'KARTAL', 'KASIM', 'KAYA', 'KAZIM', 'KEMAL', 'KEMALETTIN', 'KENAN',
  'KEREM', 'KERIM', 'KIVANC', 'KORAY', 'KORKMAZ', 'KORKUT', 'KUBILAY', 'KUDRET', 'KUTAY', 'KUTLU', 'KUZEY',
  'LEVENT', 'LUTFU', 'LUTFI', 'MAHMUT', 'MAHSUN', 'MAZHAR', 'MAZLUM', 'MECIT', 'MEHDI', 'MEHMET', 'MELIH',
  'MEMET', 'MEMIS', 'MENDERES', 'MERT', 'MERTCAN', 'MESUT', 'METE', 'METEHAN', 'METIN', 'MEVLUT', 'MIKAIL',
  'MIRAC', 'MITHAT', 'MUAMMER', 'MUCAHIT', 'MUHAMMED', 'MUHAMMET', 'MUHARREM', 'MUHSIN', 'MUHTAR', 'MUJDAT',
  'MUMIN', 'MUNIR', 'MURAT', 'MURSEL', 'MURTEZA', 'MUSA', 'MUSLUM', 'MUSTAFA', 'MUTLU', 'MUZAFFER', 'NACI',
  'NADIR', 'NAFI', 'NAFIZ', 'NAHIT', 'NAIL', 'NAIM', 'NAMIK', 'NASUH', 'NAZIM', 'NAZMI', 'NECAT', 'NECATI',
  'NECDET', 'NECIP', 'NECMETTIN', 'NEDIM', 'NEJAT', 'NEVZAT', 'NIHAT', 'NIYAZI', 'NIZAMETTIN', 'NUH',
  'NUMAN', 'NURETTIN', 'NURI', 'NURULLAH', 'NUSRET', 'OGÜN', 'OGUN', 'OGUZ', 'OGUZHAN', 'OKAN', 'OKTAY',
  'OLCAY', 'OMER', 'ONUR', 'ORHAN', 'ORKUN', 'OSMAN', 'OZAN', 'OZCAN', 'OZDEMIR', 'OZER', 'OZGUR', 'OZKAN',
  'OZMEN', 'PAŞA', 'PASA', 'PEYAM', 'POLAT', 'POYRAZ', 'RAFet', 'RAFET', 'RAGIP', 'RAHMI', 'RAIF',
  'RAMAZAN', 'RASIM', 'RASIT', 'HAŞIM', 'RECEP', 'REFIK', 'REMZI', 'RESAT', 'RESUL', 'RIDVAN', 'RIFAT',
  'RIFKI', 'RIZA', 'RUHI', 'RUSTEM', 'RUSTU', 'SABAHATTIN', 'SABAN', 'SABIT', 'SABRI', 'SACIT', 'SADETTIN',
  'SADIK', 'SADI', 'SADRI', 'SAFA', 'SAFFET', 'SAHIN', 'SAIT', 'SAKIR', 'SALIH', 'SALIM', 'SAMET', 'SAMI',
  'SAVAS', 'SEBAHATTIN', 'SECKIN', 'SEDAT', 'SEFA', 'SEFER', 'SELAHATTIN', 'SELAMI', 'SELCUK', 'SELIM',
  'SEMIH', 'SERCAN', 'SERDAR', 'SERGEN', 'SERHAN', 'SERHAT', 'SERKAN', 'SERMET', 'SERVET', 'SEYFI',
  'SEYFETTIN', 'SEYHAN', 'SEYIT', 'SEZAI', 'SEZER', 'SEZGIN', 'SIDDIK', 'SINAN', 'OMUR', 'SONER', 'SUAT',
  'SUAYIP', 'SUKRÜ', 'SUKRU', 'SULEYMAN', 'SUPHI', 'TACETTIN', 'TAHA', 'TAHIR', 'TAHSIN', 'TALAT', 'TALHA',
  'TALIP', 'TAMER', 'TANER', 'TANJU', 'TARIK', 'TARKAN', 'TASKIN', 'TAYFUN', 'TAYFUR', 'TAYLAN', 'TAYYIP',
  'TEKIN', 'TEMEL', 'TEOMAN', 'TEVFIK', 'TIMUCIN', 'TIMUR', 'TOLGA', 'TOLGAHAN', 'TOPRAK', 'TUFAN', 'TUGAY',
  'TUGRUL', 'TUNA', 'TUNC', 'TUNCAY', 'TUNCER', 'TURAN', 'TURGAY', 'TURGUT', 'TURHAN', 'TURKER', 'UFUK',
  'UGUR', 'ULAS', 'ULVI', 'UMIT', 'UMUT', 'UNAL', 'USAME', 'UTKU', 'UYGAR', 'UZEYIR', 'VAHAP', 'VAHDETTIN',
  'VAHIT', 'VAKIF', 'VECDI', 'VEDAT', 'VEFA', 'VEHBI', 'VELI', 'VEYSEL', 'VEYSI', 'VOLKAN', 'VURAL',
  'YAHYA', 'YAKUP', 'YALCIN', 'YAMAN', 'YASAR', 'YASIN', 'YAVUZ', 'YEKTA', 'YENER', 'YIGIT', 'YILDIRAY',
  'YILDIRIM', 'YILMAZ', 'YUNUS', 'YURDAKUL', 'YUSUF', 'YUCEL', 'ZAFER', 'ZAHIT', 'ZAKIR', 'ZEKAI',
  'ZEKERIYA', 'ZEKI', 'ZEYNEL', 'ZIYA', 'ZULFIKAR',

  // Kadın ilk adları (DICOM ASCII normalize)
  'ACelya', 'ACELYA', 'ADA', 'ADILE', 'AFET', 'AFIFE', 'AHU', 'AJDA', 'ALARA', 'ALEV', 'ALEYNA', 'ALIYE',
  'ASENA', 'ASIYE', 'ASLI', 'ASLIHAN', 'ASUMAN', 'ASYA', 'AYBEN', 'AYBIKE', 'AYCA', 'AYCAN', 'AYCIN',
  'AYDA', 'AYDAN', 'AYFER', 'AYGEN', 'AYGUL', 'AYLA', 'AYLIN', 'AYNUR', 'AYSE', 'AYSEGUL', 'AYSEL',
  'AYSEN', 'AYSENUR', 'AYSIN', 'AYSU', 'AYSUN', 'AYTEN', 'AZIZE', 'AZRA', 'BAHAR', 'BAHRIYE', 'BALA',
  'BANU', 'BASAK', 'EDIA', 'BEDIA', 'BEDRIYE', 'BEGUM', 'BEHIYE', 'BELGIN', 'BELIZ', 'BELKIS', 'BENGI',
  'BENGISU', 'BENGU', 'BEREN', 'BERFIN', 'BERFU', 'BERIL', 'BERNA', 'BERRA', 'BERRIN', 'BESTE', 'BETUL',
  'BEYZA', 'BEYZANUR', 'BIHTER', 'BILGE', 'BILGIN', 'BINNAZ', 'BINNUR', 'BIRGUL', 'BIRSEN', 'BUKET',
  'BURCU', 'BURCIN', 'BUSRA', 'CAGLA', 'CAHIDE', 'CANAN', 'CANDAN', 'CANSU', 'CEMILE', 'CEMRE', 'CENNET',
  'CEREN', 'CEVRIYE', 'CEYDA', 'CEYLAN', 'CIGDEM', 'CISEL', 'DAMLA', 'DEFNE', 'DEMET', 'DERYA', 'DESTAN',
  'DEVLET', 'DICLE', 'DIDEM', 'DILA', 'DILAN', 'DILARA', 'DILBER', 'DILEK', 'DILRUBA', 'DÖNDÜ', 'DONDU',
  'DURDU', 'DURU', 'DUYGU', 'EBRU', 'ECE', 'ECEM', 'ECRIN', 'EDA', 'EDANUR', 'EDIBE', 'EFSUN', 'ELA',
  'ELANUR', 'ELCIN', 'ELIF', 'ELMAS', 'ELVAN', 'EMEL', 'EMINE', 'EMRIYE', 'ulku', 'ULKU', 'ERMA', 'ESEN',
  'ESIN', 'ESMA', 'ESMANUR', 'ESMERALDA', 'ESRA', 'EYLUL', 'EZGI', 'FADIME', 'FAHRIYE', 'FATMA', 'FATMANUR',
  'FAZILET', 'FEHIME', 'FERAY', 'FERDA', 'FERIDE', 'FERIHA', 'FERYAL', 'FEYZA', 'FIDAN', 'FIGEN', 'FIKRIYE',
  'FILIZ', 'FIRDEVS', 'FULYA', 'FUNDA', 'FUSUN', 'GAMZE', 'GAYE', 'GIZEM', 'GONCA', 'GONUL', 'GOZDE',
  'GUL', 'GULAY', 'GULBAHAR', 'GULBEN', 'GULCAN', 'GULCIN', 'GULDEN', 'GULER', 'GULFEM', 'GULFER',
  'GULHAN', 'GULISTAN', 'GULLU', 'GULNAZ', 'GULNUR', 'GULPERI', 'GULSEN', 'GULSEREN', 'GULSUM', 'GULSUN',
  'GULTEN', 'GUNAY', 'GUNCE', 'GUNES', 'GUNGOR', 'GUNSEL', 'GUNSELI', 'GURBET', 'GUZIDE', 'GUZIN',
  'HABIBE', 'HACER', 'HAFIZE', 'HALE', 'HALIDE', 'HALIME', 'HAMIDE', 'HANDE', 'HANIFE', 'HANIM', 'HASIBE',
  'HASRET', 'HATICE', 'HAVVA', 'HAYAL', 'HAYRIYE', 'HAZAL', 'HAZAN', 'HEDİYE', 'HEDIYE', 'HELIN', 'HICRAN',
  'HILAL', 'HURIYE', 'HULYA', 'HUMA', 'HUMEYRA', 'HURREM', 'IFFET', 'IKBAL', 'IKLIL', 'IKRA', 'ILAYDA',
  'ILGIN', 'ILKNUR', 'ILKAY', 'IMGE', 'IMREN', 'INCI', 'IPEK', 'IREM', 'IRMAK', 'ISIK', 'ISIL', 'ITIR',
  'JALE', 'JULIDE', 'KADER', 'KADRIYE', 'KAMILE', 'KARANFIL', 'KARDELEN', 'KEVSER', 'KEZBAN', 'KIBARIYE',
  'KIRAZ', 'KISMET', 'KUBRA', 'LALE', 'LAMIA', 'LATIFE', 'LEMAN', 'LEYLA', 'LUTFIYE', 'MACIDE', 'MAKBULE',
  'MANOLYA', 'MEBURE', 'MEDINE', 'MEFTUN', 'MEHTAP', 'MELAHAT', 'MELDA', 'MELEK', 'MELIHA', 'MELIKE',
  'MELIS', 'MELISA', 'MELTEM', 'MENEKSE', 'MERAL', 'MERCAN', 'MERIC', 'MERVE', 'MERYEM', 'MESUDE', 'MINE',
  'MIRAY', 'MUAZZEZ', 'MUGE', 'MUJGAN', 'MUKADDES', 'MUKERREM', 'MUNIRE', 'MURUVVET', 'MUSERREF', 'MUSerref',
  'MUTENA', 'MUZEYYEN', 'NACIYE', 'NADIDE', 'NADIYE', 'AGEHAN', 'NAGEHAN', 'NAGIHAN', 'NAILE', 'NAIME',
  'NALAN', 'NARIN', 'NAZ', 'NAZAN', 'NAZIFE', 'NAZLI', 'NAZMIYE', 'NEBAHAT', 'NECLA', 'NECMIYE', 'NEHIR',
  'NERGIZ', 'NERGIS', 'NERIMAN', 'NERMIN', 'NESLIHAN', 'NESLISAH', 'NESRIN', 'NETICE', 'NEVAL', 'NEVIN',
  'NEVRA', 'NEZAHAT', 'NEZIH', 'NEZIHE', 'NIDA', 'NIGAR', 'NIHAL', 'NIL', 'NILAY', 'NILGUN', 'NILUFER',
  'NIMET', 'NISA', 'NISAN', 'NISANUR', 'NUR', 'NURAN', 'NURAY', 'NURCAN', 'NURDAN', 'NURGUL', 'NURHAN',
  'NURIYE', 'NURSAC', 'NURSEL', 'NURSELI', 'NURSEN', 'NURSENA', 'NURTEN', 'OYA', 'OYKU', 'OZGE', 'OZGUL',
  'OZLEM', 'OZNUR', 'PAKIZE', 'PELIN', 'PEMBE', 'PERI', 'PERIHAN', 'PERVIN', 'PETEK', 'PINAR', 'PIRIL',
  'RABIA', 'RAHIME', 'RAHSAN', 'RANA', 'RAZIYE', 'REFIKA', 'REHAN', 'REYYAN', 'REZZAN', 'ROJDA', 'RUHAN',
  'UKIYE', 'RUKIYE', 'RUMEYSA', 'RUYA', 'SAADET', 'SABAHAT', 'SABIHA', 'SABRIYE', 'SADIYE', 'SAFIYE',
  'SAHIKA', 'SAHRA', 'SAKINE', 'SALIHA', 'SAMIME', 'SANEM', 'SANIYE', 'SATI', 'SEBAHAT', 'SEBNEM', 'SEDA',
  'SEDEF', 'SEDEN', 'SEHER', 'SEHNAZ', 'SELCan', 'SELCAN', 'SELDA', 'SELEN', 'SELIN', 'SELMA', 'SELVI',
  'SEMA', 'SEMANUR', 'SEMAhat', 'SEMAHAT', 'SEMRA', 'SENA', 'SENAY', 'SENEM', 'SENIHA', 'SERAP', 'SEREN',
  'SERIFE', 'SERMIN', 'SERPIL', 'SERTAP', 'SEVcan', 'SEVCAN', 'SEVDA', 'SEVDE', 'SEVGI', 'SEVGUL', 'SEVIL',
  'SEVILAY', 'SEVIM', 'SEVIN', 'SEVINC', 'SEVTAP', 'SEYDA', 'SEYMA', 'SEYYARE', 'SEZEN', 'SEZIN', 'SIBEL',
  'SIDIKA', 'SILA', 'SIMAY', 'SIMGE', 'SINEM', 'SIRIN', 'SOLMAZ', 'SONGUL', 'SU', 'SUAT', 'SUDE', 'SUDENAZ',
  'SUEDA', 'SUHEYLA', 'SUKRAN', 'SUKRIYE', 'SULE', 'SULTAN', 'SUMRU', 'SUMEYYE', 'SUNA', 'SUNAY', 'SUREYYA',
  'SUSAN', 'SUZAN', 'TAHIRE', 'TANSU', 'TUBA', 'TUGBA', 'TUGCE', 'TULAY', 'TULIN', 'TURKAN', 'ULVIYE',
  'UMMU', 'UMMUHAN', 'UMRAN', 'VAHIDE', 'VESILE', 'VICDAN', 'VILDAN', 'YAGMUR', 'YAPRAK', 'YAREN',
  'YASEMIN', 'YELDA', 'YELIZ', 'YESIM', 'YETER', 'YILDIZ', 'YONCA', 'YUKSEL', 'YURDAGUL', 'ZAHIDE',
  'ZARIFE', 'ZEHRA', 'ZEKIYE', 'ZELAL', 'ZELIHA', 'ZERRIN', 'ZEYNEP', 'ZINNUR', 'ZIYNET', 'ZUHAl',
  'ZUHAL', 'ZULAL', 'ZULEYHA', 'ZULFIYE', 'ZUMRUT',
].map((s) => s.toUpperCase()));

const TR_SURNAMES = new Set<string>([
  'ACAR', 'ACIKGOZ', 'ADIGUZEL', 'AK', 'AKAR', 'AKBAS', 'AKBAY', 'AKBULUT', 'AKCA', 'AKCAY', 'AKDAG',
  'AKDEMIR', 'AKDENIZ', 'AKDOGAN', 'AKGUL', 'AKGUN', 'AKIN', 'AKINCI', 'AKMAN', 'AKPINAR', 'AKSOY',
  'AKSU', 'AKTAS', 'AKTURK', 'AKYILDIZ', 'AKYOL', 'AKYUZ', 'ALBAYRAK', 'ALKAN', 'ALTIN', 'ALTINTAS',
  'ALTUN', 'ALTUNTAS', 'APAYDIN', 'ARAS', 'ARICAN', 'ARSLAN', 'ASLAN', 'ATALAY', 'ATASEVER', 'ATES',
  'ATMACA', 'AVCI', 'AY', 'AYAZ', 'AYDEMIR', 'AYDIN', 'AYDOGAN', 'AYDOGDU', 'AYGUN', 'AYHAN', 'AYKUT',
  'AZAK', 'BABA', 'BACAK', 'BAGCI', 'BAHADIR', 'BAKIR', 'BAL', 'BALABAN', 'BALCI', 'BALKAN', 'BARAN',
  'BARIS', 'BAS', 'BASAK', 'BASARAN', 'BASER', 'BASKAN', 'BASTURK', 'BATMAZ', 'BAYINDIR', 'BAYRAK',
  'BAYRAKTAR', 'BAYRAM', 'BEKTAS', 'BERBER', 'BERK', 'BEYAZ', 'BICER', 'BILGE', 'BILGIN', 'BILICI',
  'BILIR', 'BINGOL', 'BIROL', 'BOZ', 'BOZDOGAN', 'BOZKURT', 'BUDAK', 'BULBUL', 'BULUT', 'BUYUK',
  'CAGLAR', 'CAGLAYAN', 'CAKICI', 'CAKIR', 'CAKMAK', 'CALISKAN', 'CAM', 'CAN', 'CANDAN', 'CANER',
  'CANKAYA', 'CANPOLAT', 'CAVUS', 'CAVUSOGLU', 'CEBECI', 'CELIK', 'CENGIZ', 'CETIN', 'CETINKAYA',
  'CEVIK', 'CEYLAN', 'CIFTCI', 'CIHAN', 'CINAR', 'CITAK', 'COBAN', 'COLAK', 'COSKUN', 'CUMHUR',
  'DAG', 'DAGDELEN', 'DAGLI', 'DAL', 'DALKILIC', 'DEMIR', 'DEMIRAG', 'DEMIRBAS', 'DEMIRCI', 'DEMIREL',
  'DEMIRHAN', 'DEMIRKAN', 'DEMIRTAS', 'DENIZ', 'DERE', 'DEVECI', 'DIKMEN', 'DINC', 'DINCER', 'DOGAN',
  'DOGANAY', 'DOGRU', 'DONMEZ', 'DUMAN', 'DURAK', 'DURAN', 'DURMAZ', 'DURMUS', 'DURSUN', 'EFE',
  'EKICI', 'EKINCI', 'EKSI', 'ELMAS', 'EMIR', 'ENGIN', 'ER', 'ERALP', 'ERBAY', 'ERCAN', 'ERDEM',
  'ERDEN', 'ERDOGAN', 'EREN', 'ERGIN', 'ERGUL', 'ERGUN', 'ERKAN', 'ERKOC', 'EROL', 'ERSIN', 'ERSOY',
  'ERTAS', 'ERTUGRUL', 'ERTURK', 'ERYILMAZ', 'ESEN', 'ESER', 'EVCIMEN', 'EVREN', 'FIDAN', 'FINDIK',
  'FIRAT', 'GEDIK', 'GENC', 'GEZER', 'GOK', 'GOKCE', 'GOKCEN', 'GOKMEN', 'GOKSOY', 'GOKSU', 'GOKTAS',
  'GOKTEPE', 'GULER', 'GULES', 'GULTEKIN', 'GUMUS', 'GUN', 'GUNAY', 'GUNAYDIN', 'GUNDUZ', 'GUNER',
  'GUNES', 'GUNEY', 'GUNGOR', 'GUR', 'GURBUZ', 'GUREL', 'GURKAN', 'GURSOY', 'GUVEN', 'GUZEL',
  'HACIOGLU', 'HALICI', 'HAMZAOGLU', 'HASANOGLU', 'HATIPOGLU', 'HAYTA', 'HIZARCI', 'ISIK', 'IŞIK',
  'INAN', 'INCE', 'INCECAM', 'INCEDAYI', 'IPEK', 'ISLER', 'KABA', 'KABAK', 'KACAR', 'KAHRAMAN',
  'KAHVECI', 'KALAYCI', 'KALELİ', 'KALELI', 'KALKAN', 'KANDEMIR', 'KAPLAN', 'KARA', 'KARAASLAN',
  'KARABACAK', 'KARABULUT', 'KARACA', 'KARADAG', 'KARADEMIR', 'KARADENIZ', 'KARAGOZ', 'KARAHAN',
  'KARAKAS', 'KARAKAYA', 'KARAKOC', 'KARAKUS', 'KARAMAN', 'KARATAS', 'KARAYEL', 'KARTAL', 'KASAP',
  'KAVAK', 'KAYA', 'KAYACAN', 'KAYHAN', 'KAYMAK', 'KAZAN', 'KELES', 'KEMAL', 'KESER', 'KESKIN',
  'KILIC', 'KILINC', 'KIR', 'KIRAN', 'KIRAZ', 'KOC', 'KOCA', 'KOCABAS', 'KOCAK', 'KOCAMAN', 'KOCYIGIT',
  'KONUK', 'KOPRULU', 'KORKMAZ', 'KORKUT', 'KOSE', 'KOYUNCU', 'KOZAN', 'KUCUK', 'KUL', 'KULA',
  'KURT', 'KURTULUS', 'KURU', 'KUS', 'KUTLU', 'KUZUCU', 'MERT', 'METIN', 'MUTLU', 'NALBANT', 'NAR',
  'NAS', 'NAZLI', 'OCAK', 'OGUZ', 'OK', 'OKATAN', 'OKTAY', 'OKUR', 'OLMEZ', 'ONAL', 'ONAT', 'ONCEL',
  'ONDER', 'ONER', 'ORAL', 'ORHAN', 'ORUC', 'OSMANOGLU', 'OZ', 'OZALP', 'OZASLAN', 'OZAY', 'OZAYDIN',
  'OZBilen', 'OZBILEN', 'OZCAN', 'OZCELIK', 'OZDAG', 'OZDEMIR', 'OZDEN', 'OZER', 'OZGUR', 'OZKAN',
  'OZKAYA', 'OZKUL', 'OZMEN', 'OZSOY', 'OZTOPRAK', 'OZTURK', 'OZYURT', 'PALA', 'ugurlu', 'UGURLU',
  'PARLAK', 'PEHLIVAN', 'PEKER', 'POLAT', 'POYRAZ', 'SAGIR', 'SAGLAM', 'SAHIN', 'SAKA', 'SALMAN',
  'SANCAK', 'SANLI', 'SARI', 'SARICA', 'SARIKAYA', 'SARITAS', 'SARIYILDIZ', 'SAVAS', 'SAYGIN',
  'SAYIN', 'SECKIN', 'SEKER', 'SELCUK', 'SEN', 'SENER', 'SENGUL', 'SENOL', 'SENTURK', 'SERBEST',
  'SERIN', 'SERT', 'SEVIM', 'SEVINC', 'SEYHAN', 'SEZER', 'SEZGIN', 'SIMSEK', 'SINAN', 'SIRIN',
  'SIVASLI', 'SOLAK', 'SOLMAZ', 'SONMEZ', 'SOYLU', 'SOYlu', 'SOZEN', 'SUBASI', 'SULUN', 'SUNGUR',
  'SAHIN', 'SAHINER', 'SEN', 'SENGUL', 'SENTURK', 'SIMSEK', 'TAN', 'TANRIVERDI', 'TARHAN', 'TAS',
  'TASCI', 'TASDEMIR', 'TASKIN', 'TASKIRAN', 'TATLI', 'TAYLAN', 'TEKIN', 'TEKIR', 'TEMEL', 'TEMIZ',
  'TERZI', 'TEZCAN', 'TILKI', 'TIMUR', 'TOK', 'TOKGÖZ', 'TOKGOZ', 'TOKMAK', 'TOPAL', 'TOPALOGLU',
  'TOPCU', 'TOPRAK', 'TOPTAS', 'TORUN', 'TOSUN', 'TUFAN', 'TUNA', 'TUNC', 'TUNCAY', 'TUNCEL',
  'TUNCER', 'TURAN', 'TURGUT', 'TURK', 'TURKAY', 'TURKER', 'TURKMEN', 'TURKOGLU', 'TURNACI',
  'TUTAR', 'UCAR', 'UGUR', 'ULUSOY', 'UNAL', 'UNLU', 'UNSAL', 'URAL', 'USLU', 'USTA', 'UYANIK',
  'UYAR', 'UYSAL', 'UZUN', 'VAROL', 'VURAL', 'YALCIN', 'YALCINKAYA', 'YAMAN', 'YAPICI', 'YASAR',
  'YAVUZ', 'YAZICI', 'YEL', 'YENER', 'YIGIT', 'YILDIRIM', 'YILDIZ', 'YILMAZ', 'YORUK', 'YUCEL',
  'YUKSEL', 'YURT', 'YURTSEVEN', 'ZENGIN', 'ZORLU',
].map((s) => s.toUpperCase()));

const TR_CHAR_MAP: Record<string, string> = {
  Ç: 'C', Ğ: 'G', İ: 'I', I: 'I', Ö: 'O', Ş: 'S', Ü: 'U',
  ç: 'C', ğ: 'G', i: 'I', ı: 'I', ö: 'O', ş: 'S', ü: 'U',
};

function toAsciiUpper(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    out += TR_CHAR_MAP[ch] ?? ch.toUpperCase();
  }
  return out;
}

const VOWEL_RE = /[AEIOU]/;
const CONSONANT_RE = /[BCDFGHJKLMNPQRSTVWXYZ]/;
// Türkçe soyadların başında bulunamayacak çift ünsüz kümeleri
const INVALID_ONSET_RE = /^(RT|RK|RN|RM|RS|RP|RB|RD|RG|RF|RV|RZ|NT|ND|NK|NG|NM|NL|NR|NS|LT|LD|LK|LP|LB|LF|LG|LM|LN|LS|LV|LZ|FT|HT|KT|PT|ZT|ST|SK|SP|SM|SN|SL|SR|MP|MB|MF|MK|MT|MD|MN|ML|MR|MS|MZ|CT|CK|CS|CN|CM|CL|CR|TC|TK|TP|TS|TN|TM|TL|BD|BG|BK|BP|BS|BT|BZ|GD|GK|GP|GS|GT|GZ|DC|DK|DP|DS|DT|DZ|PC|PK|PS|PZ|ZC|ZK|ZP|ZS|VC|VK|VP|VS|VT|VZ)/;

function isValidSurnameSegment(norm: string): boolean {
  if (norm.length < 3 || /[QWX]/.test(norm)) return false;
  if (TR_SURNAMES.has(norm)) return true;
  if (norm.length < 4) return false;
  if (!VOWEL_RE.test(norm) || !CONSONANT_RE.test(norm)) return false;
  if (INVALID_ONSET_RE.test(norm)) return false;
  return true;
}

/**
 * Bitişik büyük harfli Türkçe hasta adını (örn. "HACIAHMETKARAHAN")
 * [1. Ad] + [2. Ad (varsa)] + [Soyad (son parça)] kuralına göre görsel olarak ayırır.
 */
export function formatDisplayPatientName(raw?: string): string {
  const cleaned = (raw ?? '').trim();
  if (!cleaned || cleaned === '—') return '—';

  // 1) DICOM '^' veya '_' ayraçları varsa boşluğa çevir
  if (/[\^_]/.test(cleaned)) {
    return cleaned.replace(/[\^_]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // 2) Zaten boşluk içeriyorsa fazla boşlukları sadeleştirip koru
  if (/\s/.test(cleaned)) {
    return cleaned.replace(/\s+/g, ' ').trim();
  }

  // 3) CamelCase (örn. "HaciAhmetKarahan") ise büyük harf geçişlerinden ayır
  if (/[a-zçğıöşü]/.test(cleaned) && /[A-ZÇĞİÖŞÜ]/.test(cleaned)) {
    const camelSplit = cleaned.replace(/([a-zçğıöşü])([A-ZÇĞİÖŞÜ])/g, '$1 $2');
    if (camelSplit.includes(' ')) return camelSplit;
  }

  const norm = toAsciiUpper(cleaned);
  if (norm.length < 6 || !/^[A-Z]+$/.test(norm)) {
    return cleaned;
  }

  let bestParts: string[] | null = null;
  let bestScore = -Infinity;

  const n = norm.length;

  // Aday 1: [1. Ad] + [Soyad]
  for (let i = 3; i <= n - 3; i++) {
    const name1 = norm.slice(0, i);
    if (!TR_GIVEN_NAMES.has(name1)) continue;
    const surname = norm.slice(i);
    if (!isValidSurnameSegment(surname)) continue;

    let score = 10 + name1.length * 2;
    if (TR_SURNAMES.has(surname)) score += 32;
    if (surname.length >= 4 && surname.length <= 9) score += 8;
    if (surname.length > 10 && !TR_SURNAMES.has(surname)) score -= 12;

    if (score > bestScore) {
      bestScore = score;
      bestParts = [cleaned.slice(0, i), cleaned.slice(i)];
    }

    // Aday 2: [1. Ad] + [2. Ad] + [Soyad (son parça)]
    for (let j = i + 3; j <= n - 3; j++) {
      const name2 = norm.slice(i, j);
      if (!TR_GIVEN_NAMES.has(name2)) continue;
      const surname2 = norm.slice(j);
      if (!isValidSurnameSegment(surname2)) continue;
      // Soyad sözlükte değilse en az 4 harf olmalı (örn. "GUN" + "EY" bölünmesini önler)
      if (!TR_SURNAMES.has(surname2) && surname2.length < 4) continue;
      // Bir önceki adım (i -> n) zaten bilinen tek bir soyadsa (örn. CANKAYA, KARAHAN) onu bölme
      if (TR_SURNAMES.has(surname)) continue;

      let score3 = 24 + (name1.length + name2.length) * 2;
      if (TR_SURNAMES.has(surname2)) score3 += 35;
      if (TR_GIVEN_NAMES.has(name1 + name2)) score3 -= 14;

      if (score3 > bestScore) {
        bestScore = score3;
        bestParts = [cleaned.slice(0, i), cleaned.slice(i, j), cleaned.slice(j)];
      }
    }
  }

  return bestParts ? bestParts.join(' ') : cleaned;
}
