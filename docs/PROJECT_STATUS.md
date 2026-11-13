# Proje durumu

12 Kasım 2026. Claude'un kesilen oturumundan devam edildi. Mevcut ürün/tasarım korundu; son devamda tek komutla geliştirme başlatma, E2E yalıtımı, ödeme dönemi/webhook düzeltmeleri ve güncel Docker doğrulaması tamamlandı. Commit veya dış ortama yayın yapılmadı.

| Alan | Durum |
| --- | --- |
| Ürün | DXF analiz/fiyat, teklif/paylaşım/onay/sipariş, parça hafızası ve adet alternatifleri, işlem kataloğu ve müşteri malzemesi, toplu atama ve parça listesi eşleme, müşteri portalı, katalog/kurulum, ekip/rol/plan, ayarlar/destek, veri export/silme ve platform yönetimi uygulandı |
| Görünüm | Türkçe, açık/koyu tema; gerçek motor SVG görselleri; responsive kontroller |
| Doğrulama | 90 test PGlite, 90 test PostgreSQL 17; geliştirmede 14, Docker üretiminde 14 tarayıcı testi; lint 0 hata/40 mevcut uyarı; tip ve üretim derlemesi geçti |
| Dağıtım hazırlığı | Dockerfile, Compose, tek release migration, CI, env referansı, sağlık, yedek/restore ve geri dönüş kılavuzu |
| Yerel dağıtım | Güncel uygulama Docker'da yeniden derlendi; PostgreSQL 17 ve migration 0000–0002, migration tekrarı, sağlıklı servisler, root olmayan süreç ve ayrı DB'ye restore doğrulandı. Yerel Mailpit'e gerçek SMTP protokolüyle 27 test mesajı ulaştı |
| Dış dağıtım | Yapılmadı; alan adı, HTTPS, gerçek sunucu ve izleme kurulmadı |
| Ticari aktivasyon | Yapılmadı; iyzico/SMTP, yasal işletme/metinler, müşteri doğrulaması ve ücretli lansman bekliyor |

## Bu oturumun değişiklikleri

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
3. Ayrı staging/üretim, HTTPS ters vekili, secret/izleme/yedek zamanlayıcısı ve alarm kurun; uzaktan CI sonucunu gözleyin.
4. İşletme kimliği, yasal metin incelemesi ve marka kontrolünü tamamlayın.
5. Pilot atölyelerde gerçek çizimleri/makine tablolarını kalibre edin ve ücretli devam isteğini ölçün.

Mevcut test başarısı üretime veya ticari kullanıma tam hazır olunduğu anlamına gelmez. Ayrıntılı sınırlar KNOWN_LIMITATIONS.md, komut kanıtları TEST_RESULTS.md, işletim DEPLOYMENT.md içindedir.
