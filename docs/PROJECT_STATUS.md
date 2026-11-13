# Proje durumu

13 Kasım 2026. Ürün GitHub'a (özel depo `brutalstein/kontura`) konuldu, Supabase veritabanı ve Cloudflare Workers üzerinde ücretsiz katmanda yayına alındı ve canlı ortamda gerçekçi atölye verisiyle kabul testinden geçirildi: https://kontura.ustacenker16.workers.dev. Ödeme ve e-posta etkin değildir; ürün denemeye ve pilot kullanıma açıktır, ücretli ticari kullanıma hazır olduğu iddia edilmez.

| Alan | Durum |
| --- | --- |
| Ürün | DXF analiz/fiyat, teklif/paylaşım/onay/sipariş, parça hafızası ve adet alternatifleri, işlem kataloğu ve müşteri malzemesi, toplu atama ve parça listesi eşleme, müşteri portalı, katalog/kurulum, ekip/rol/plan, ayarlar/destek, veri export/silme ve platform yönetimi uygulandı |
| Görünüm | Türkçe, açık/koyu tema; gerçek motor SVG görselleri; responsive kontroller |
| Doğrulama | 13 Kasım: 93 test PGlite (yerel ve CI), 93 test PostgreSQL 17 (CI), 15 tarayıcı testi (yerel ve CI), lint 0 hata/41 uyarı, tip ve üretim derlemesi geçti; uzak CI yeşil. Docker üretiminde 14 tarayıcı testi 12 Kasım sonucudur, yeniden çalıştırılmadı |
| Dağıtım hazırlığı | Dockerfile, Compose, tek release migration, CI, env referansı, sağlık, yedek/restore ve geri dönüş kılavuzu |
| Yerel dağıtım | Güncel uygulama Docker'da yeniden derlendi; PostgreSQL 17 ve migration 0000–0002, migration tekrarı, sağlıklı servisler, root olmayan süreç ve ayrı DB'ye restore doğrulandı. Yerel Mailpit'e gerçek SMTP protokolüyle 27 test mesajı ulaştı |
| Dış dağıtım | Yapıldı: Cloudflare Workers (OpenNext) + Hyperdrive + Supabase PostgreSQL 17, HTTPS `workers.dev` adresi, günlük keep-alive işi. Özel alan adı, uptime alarmı ve zamanlanmış yedek kurulmadı |
| Canlı kabul testi | Kayıt, kurulum, beş gerçekçi DXF, parça listesi, hatalı çizim, teklif, müşteri onayı, sipariş, portal talebi ve dışa aktarma canlıda geçti; fiyatlar elle doğrulandı. Ayrıntı: acceptance/README.md |
| Ticari aktivasyon | Yapılmadı; iyzico üye işyeri hesabı, SMTP hesabı/alan adı, yasal işletme/metinler, müşteri doğrulaması ve ücretli lansman bekliyor. Deneme 14 gündür; plan yalnızca işletmeci komutuyla elle tanımlanabilir |

## 13 Kasım dağıtım oturumu

Cloudflare hedefi için `KONTURA_TARGET=cloudflare` derlemesi PGlite'ı paketten çıkarır; Worker her istekte Hyperdrive bağlamasından kendi veritabanı bağlantısını açar. SMTP'siz üretim yalnızca açık `MAIL_OPTIONAL=true` ile çalışır: e-posta gönderilmez, gönderilmiş gibi de gösterilmez; teklif ve davet bağlantıları ekranda verilir, şifre sıfırlama bağlantısını işletmeci komutu üretir. İşletmeci komutu plan da tanımlayabilir. İstemci IP'si önce Cloudflare başlığından okunur.

Kabul testi üç sorun buldu ve üçü de düzeltildi: kısmi dolu plakada fazla malzeme faturalayan yerleşim, delik çapı kalınlığa eşitken çıkan yanlış uyarı ve uzak CI'ı kıran test temizliği hatası.

## Önceki oturumun değişiklikleri

Son devam: `pnpm dev` / `node scripts/dev.mjs` bağımlılıkları kurar, mevcut ortam dosyasını korur ve migration/sağlık kontrolünden sonra adresi gösterir. Üst klasördeki `dev.cmd` aynı başlatıcıyı çalıştırır. Yalnızca açık yerel veritabanı ayarı kullanılır; miras alınan yabancı DATABASE_URL kullanılmaz. Next'in kendi ortam yükleyicisi değişken genişletmesini ve kaçışlı dolar içeren parolaları çocuk süreç boyunca korur. Ctrl+C ve tekrar başlatma doğrulandı.

E2E 3101 portunda `.next-e2e` / `.data/e2e` kullanır; geliştirme verisine yazmaz. Üretim tarayıcı yapılandırması yalnızca açık onay bayrağıyla, geçici yerel kurulumda çalıştırılır. Webhook olay kaydı, sağlayıcıdan doğrulanmış dönem, firma güncellemesi ve audit aynı kilitli transaction içindedir. Yinelenen/geciken bildirimler süre eklemez; başarısız işlem tekrar denenebilir; iptal edilmiş abonelik yeniden etkinleşmez. Ödeme dönemi iyzico'nun başarılı sipariş `endPeriod` alanından alınır; gecikmiş ödeme süresiz erişim sağlamaz. Canlı sağlayıcı hesabında henüz denenmedi.

Portal eski fiyatı yeni seçimde göstermiyor ve geciken eski yanıtı uygulamıyor. Tailwind src dışındaki üretilmiş dosyaları taramıyor. Lint hataları giderildi. Admin komutu ortam dosyasını okuyor; PostgreSQL migration komutu açık bağlantı gerektiriyor. Testler gerçek PostgreSQL üzerinde geçici bağımsız veritabanlarıyla da çalışabiliyor. CI iki sürücü ve tarayıcı akışını çalıştıracak şekilde hazırlandı.

## Müşteri ihtiyaçları paketleri

CUSTOMER_NEEDS_RESEARCH.md içindeki ilk geliştirme paketinden yapılanlar:

- Paket A, parça hafızası ve adet alternatifleri: müşteriye bağlı değişmez parça revizyonları, tekrar teklifte güncel tarifeyle fiyat ve eski fiyatla fark, en fazla üç dondurulmuş adet alternatifi ve müşterinin birini seçerek onaylaması.
- Paket C, tam kapsamlı teklif: firma düzeyinde işlem kataloğu (ad, birim, birim fiyat, kalem başına bir kez parti ücreti), kalemde parça başına işlem miktarı, "malzeme müşteriden" seçeneği (malzeme maliyeti sıfır, ayrı stok). İşlem tutarı kâr ve adet indirimine girer. Müşteri yalnızca işlem adını ve malzemenin kendisinden olduğunu görür. Katalogdan silinen işlem taslak teklifin fiyatlanmasını ve gönderilmesini durdurur. Bütün sayı alanları ondalık virgül kabul eder. Migration 0002 ekleyicidir.
- Paket B'nin ilk dilimi, çok parçalı talep: taslak teklifin tüm kalemlerine tek adımda malzeme, makine ve kalınlık atama; Excel'den yapıştırılan parça listesini (ad veya parça kodu, adet, kalınlık, malzeme) kalemlerle eşleme, eşleşmeyenleri bildirme, okunamayan satırda hiçbir şeyi değiştirmeme.

Yapılmayanlar: destek dosyaları (PDF/STEP), eksik bilgi bağlantısı, "teknik inceleme bekliyor" durumu, CSV/Excel dosyası yükleme ve sütun eşleme ekranı, onaylı üretim paketi, kalibrasyon, termin ve artık stok paketleri.

## Sıradaki yayın kapıları

1. Yerelde doğrulanan webhook atomiklik/sıralama, başarılı ödeme dönemi ve süre sonu erişim politikasını gerçek iyzico sandbox hesabında doğrulayın; kaçırılan bildirimler için işletim/uzlaştırma prosedürünü tamamlayın.
2. Gerçek SMTP ve iyzico sandbox/canlı yetkilerini bağlayıp uçtan uca doğrulayın.
3. Ayrı staging ortamı, uptime alarmı ve zamanlanmış veritabanı yedeği kurun. Sürekli kullanımda Workers ücretli planına geçin (ücretsiz katmanda istek başına 10 ms CPU sınırı var).
4. İşletme kimliği, yasal metin incelemesi ve marka kontrolünü tamamlayın.
5. Pilot atölyelerde gerçek çizimleri/makine tablolarını kalibre edin ve ücretli devam isteğini ölçün.

Mevcut test başarısı üretime veya ticari kullanıma tam hazır olunduğu anlamına gelmez. Ayrıntılı sınırlar KNOWN_LIMITATIONS.md, komut kanıtları TEST_RESULTS.md, işletim DEPLOYMENT.md içindedir.
