# Mimari

| Katman | Sorumluluk |
| --- | --- |
| src/engine | DXF, geometri/contour analizi, dikdörtgen nesting, saf maliyet hesabı |
| src/server | Drizzle şeması, veritabanı, oturumlar, roller, katalog, teklifler, ödeme, veri işlemleri |
| src/app | App Router sayfaları, server action'lar ve HTTP sınırları |
| src/ui | Formlar, SVG önizlemeleri, portal, biçimlendirme ve tema |
| drizzle | Sürümlenmiş PostgreSQL migration ve migration günlüğü |
| tests | Geometri/servis testleri, tarayıcı akışları ve responsive kontroller |

Tek uygulama ve tek veritabanı ilk dağıtım sınırıdır. PostgreSQL üretim sürücüsü `pg`, geliştirme/test sürücüsü PGlite'dır. `getDb()` süreç başına bağlantı sözünü saklar; başarısız açılışı yeniden denemeye izin verir. PGlite aynı disk dizinini paylaşan eşzamanlı süreçlere uygun değildir.

## Teklif akışı

1. Oturumdan kullanıcı, firma ve rol çözülür; `Ctx` oluşturulur.
2. Dosya oturum/origin/boyut kontrolünden geçer. DXF metni veritabanında saklanır.
3. Parser yolları milimetreye dönüştürür. Analiz konturları birleştirir, mükerrerleri ayıklar, delik ve büküm bilgilerini çıkarır.
4. Katalogdaki malzeme, makine ve kalınlık doğrulanır. Kesim tablosu aralık içinde enterpole edilir; dışına tahmin yürütülmez.
5. MaxRects ve uygun olduğunda ızgara yerleşimi sac tüketimini tahmin eder. Kurallar kalem ve teklif toplamlarını oluşturur.
6. Müşteri bağlantısında iç maliyet ve marj görünmez. Onay siparişe dönüşür.

Kesim dışı işler firma düzeyindeki `operations` tablosundan gelir. Kalem, işlemin kimliğini, adının ve biriminin anlık kopyasını ve parça başına miktarını saklar; fiyat taslakta her hesaplamada güncel katalogdan okunur, gönderimde dondurulur. İşlem tutarı motorun ek maliyet alanına girer, böylece kâr ve adet indirimi ona da uygulanır. Katalogdan silinen işlem kalemde kaldığı sürece hesap hata verir ve teklif gönderilemez. Müşteri malzemesi olan kalem ayrı bir stok anahtarıyla yerleştirilir ve malzeme maliyeti sıfırdır.

Toplu atama ve parça listesi eşleme aynı servis katmanındadır: katalog kimlikleri firmaya göre doğrulanır, liste önce bütünüyle çözümlenir, okunamayan satırda hiçbir kalem değişmez, güncellemeler tek işlemde yazılır ve teklif yeniden hesaplanır. Bu eylemlerden sonra istemcideki kalem formları yeniden kurulur; aksi halde kontrolsüz alanlar eski değeri gösterir ve otomatik kayıt onu geri yazabilir.

Portal aynı sunucu hesaplamasını kullanır; istemciden fiyat kabul edilmez. İstemci tahmin yanıtını yalnızca o yanıtın üretildiği seçimle gösterir. Seçim değişince eski sonuç gizlenir ve eski isteğin yanıtı yok sayılır.

## Güven sınırları

Yalıtım sorgulardaki `orgId` ve yabancı kayıt sahiplik kontrolüne dayanır; RLS yoktur. Roller owner/admin/estimator/viewer. Faturalama ve firma silme sahibi, platform yönetimi ayrıca `isPlatformAdmin` gerektirir.

Parolalar scrypt, oturum ve tek kullanımlık token'lar özetlenerek saklanır. Kamuya açık teklif token'ı bağlantıyı bilen kişiye erişim verir; bağlantı gizli tutulmalıdır.

SMTP Nodemailer, ödeme iyzico abonelik uçları üzerinden yapılır. Callback sonucu sağlayıcıdan sorgular; webhook imzası doğrulanır. Mevcut ödeme testleri test yanıtları kullanır; gerçek sandbox/canlı işlem kanıtı değildir.

Sayfalar oturumu okur ve dinamik render edilir; Cache Components kapalıdır. `/api/health` veritabanında `select 1` çalıştırır; SMTP ve ödeme erişimini ölçmez.
