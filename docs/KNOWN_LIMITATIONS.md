# Bilinen sınırlamalar

12 Kasım 2026, devam oturumu durumu.

## Canlı yayın kapıları

- Harici dağıtım yapılmadı; alan adı/TLS, gerçek sunucu ve o sunucudaki PostgreSQL doğrulanmadı. Yerel PostgreSQL 17 ve güncel Docker kurulumu doğrulandı.
- Docker/Compose imajı, gerçek PostgreSQL testleri, migration tekrarı ve ayrı veritabanına geri yükleme yerelde doğrulandı. Uzaktan CI ve gerçek sunucu işletimi doğrulanmadı.
- Üretim sunucusundan yerel Mailpit'e SMTP teslimi doğrulandı; dış alıcıya gerçek SMTP teslimi ve iyzico sandbox/canlı işlemleri yapılmadı. Üye işyeri, plan/anahtarlar, imzalı webhook aktivasyonu ve gerçek ödeme formu CSP kontrolü bekliyor.
- Webhook atomikliği, yinelenen/geciken olaylar, sağlayıcının başarılı ödeme dönemi ve süre sonu erişimi yerel servis testleriyle kapatıldı. Bu testlerde iyzico yanıtları taklittir; gerçek sağlayıcı doğrulamasının yerine geçmez. Tüm webhook denemeleri kaçırılırsa düzenli otomatik uzlaştırma işi yoktur; abonelik sağlayıcıyla yeniden eşitlenene kadar ücretli erişim süresi dolabilir.
- İşletme unvanı/adresi, destek adresi, marka kontrolü ve yasal metin incelemesi tamamlanmalıdır. Yasal sayfalarda taslak uyarısı vardır.

## Ürün

- Yalnızca ASCII 2B DXF; DWG/STEP/IGES, 3B açınım ve G kodu yok. Desteklenmeyen varlık/açık kontur kullanıcı incelemesi gerektirir.
- Nesting sınır dikdörtgenleriyle ve 90 derece dönüşledir. Gerçek şekil/delik içine yerleşim yoktur. 5.000 yerleşim üzeri işler örnekleme/uzatım kullanabilir.
- Hazır kesim tabloları örnektir; makine/gaz/kalite/malzeme kalibrasyonu gerekir. Otomatik teklif tahmindir.
- Para hesabı JavaScript sayıları ve iki basamağa yuvarlamayla yapılır; muhasebe/e-fatura sistemi değildir.
- DXF veritabanında metindir; nesne depolama, kuyruk ve antivirüs taraması yoktur.
- Arayüz Türkçedir. PDF tarayıcı yazdırmasıyla alınır; sunucuda PDF dosyası üretilmez.
- İşlem miktarı her kalemde elle girilir; boya alanı veya kaynak boyu çizimden otomatik türetilmez (ekranda yalnızca tek yüz alanı ve kesim boyu ipucu olarak gösterilir). Parti ücreti kalem başına bir kez eklenir; aynı işlemi kullanan kalemler arasında paylaşılmaz.
- Müşteri malzemesi seçildiğinde sac maliyeti sıfırlanır; müşteriden gelen sacın stok/teslim takibi, fire sorumluluğu ve irsaliyesi yoktur.
- Parça listesi yalnızca yapıştırılarak verilir; sütunlar sekme veya noktalı virgülle ayrılır, sıra sabittir, CSV/Excel dosyası yüklenemez. Eşleşme kalem adı veya parça koduyla birebirdir (büyük/küçük harf ve .dxf uzantısı yok sayılır). Toplu düzenleme ve liste, başka kalemde kaydedilmemiş yazıyı siler.
- Destek dosyası (PDF/STEP) eki, eksik bilgi bağlantısı ve teknik inceleme durumu yoktur.

## İşletim ve doğrulama

- Uygulama düzeyinde yalıtım; RLS yok. Süreç içi hız sınırı, güvenilir ters vekil IP başlığı ve unsafe-inline CSP sınırları vardır.
- Paralel kota/koltuk yarışları, dağıtık yük, uzun süreli stres ve bağımsız sızma testi doğrulanmadı.
- İzleme/uyarı ve otomatik yedek çalışan servis olarak kurulmadı; sağlık ucu ve prosedürler hazır.
- Ekran okuyucu/WCAG denetimi yok. Responsive/tema/taşma kontrolleri bunun yerine geçmez.
- Lint 0 hata, 40 kullanılmayan değişken uyarısıyla geçti. Vite `__dirname` için ileri sürüm uyarısı verir.
- Standart E2E ayrı port/derleme/veri dizininde geliştirme/PGlite/test faturalamasıyla çalışır. Ayrıca güncel Docker/PostgreSQL/SMTP üretim sunucusunda 14 E2E geçti; bu yerel localhost kontrolü gerçek HTTPS oturumunu doğrulamaz. Önceki oturumun soğuk sunucu kayıt takılması son tam suite'te görülmedi; tarihsel kök neden bağımsız olarak kanıtlanmadı.
- Yeni geliştirme başlatıcısı miras alınan yabancı DATABASE_URL değerini kullanmaz. Doğrudan Next veya yönetici/migration komutlarını çalıştırırken ortam değişkenleri hâlâ önceliklidir; bağlantının bu projeye ait olduğundan emin olun.
- Üretim E2E tekrarları aynı süreçte saatlik 10 kayıt sınırını tüketebilir. Geçici test kurulumunun app sürecini tekrar koşudan önce yeniden başlatın; uygulamadaki hız sınırını kapatmayın.

Ürünün üretime veya ticari kullanıma bütünüyle hazır olduğu iddia edilmiyor.
