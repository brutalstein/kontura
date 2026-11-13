# Güvenlik ve işletim sınırları

Bu belge mevcut önlemleri ve açık işleri kaydeder; bağımsız sızma testi veya sertifika değildir.

## Mevcut önlemler

- scrypt parola özeti; HTTP-only oturum, üretimde Secure ve SameSite=Lax.
- Özetlenmiş oturum/tek kullanımlık token'lar; sunucuda rol/plan kontrolleri.
- Firma kapsamlı sorgular ve yabancı kayıt sahiplik kontrolü. İkinci firmanın teklif okuma/yükleme denemeleri test edilir.
- DXF boyut ve parser kaynak sınırları, girdi doğrulaması ve süreç içi hız sınırı.
- Mutasyon HTTP uçlarında origin kontrolü ve Next server action korumaları.
- Nosniff, frame kısıtları, referer politikası, CSP ve üretimde HSTS.
- Ödeme webhook imzası ve tekrar olay kimliği kontrolü. Kart verisi sunucudan geçmez.
- Sahibe JSON dışa aktarımı ve adla onaylı firma silme. Platform yetkisi ayrıdır.

## Canlı kurulum (Cloudflare Workers + Supabase)

- Veritabanı bağlantı dizesi yalnızca Hyperdrive yapılandırmasında ve Git'e girmeyen `.env.production.local` dosyasında durur; depoda ve Worker değişkenlerinde yoktur.
- Supabase Data API kapalıdır ve tüm tablolarda RLS açıktır; anahtarla veya anahtarsız REST erişimi veriye ulaşamaz. Uygulama tablo sahibi olarak bağlanır; firma yalıtımı RLS'e değil uygulama sorgularına dayanır.
- Yerel araçların Supabase bağlantısı `sslmode=no-verify` kullanır: trafik şifrelidir ama sunucu sertifikası doğrulanmaz. Worker'ın bağlantısı Hyperdrive üzerindendir ve bundan etkilenmez. Supabase kök sertifikasını tanıtıp `verify-full` kullanmak açık iştir.
- İstemci IP'si önce `cf-connecting-ip` başlığından okunur; bu başlığı Cloudflare yazar. Hız sınırı Worker örneği başına bellektedir, örnekler arasında paylaşılmaz.
- E-posta kapalıyken doğrulama e-postası gitmez; hesaplar e-posta sahipliği kanıtlanmadan kullanılır. Şifre sıfırlama bağlantısını yalnızca veritabanı erişimi olan işletmeci üretebilir.
- Canlı kabul testinde oturumsuz tarayıcıdan müşteri teklif sayfasında maliyet dökümü ve kâr görünmediği, kapalı portal adresinin 404 döndüğü, anonim dışa aktarmanın 401 döndüğü doğrulandı. Bağımsız sızma testi yapılmadı.

## Yayın öncesi

PostgreSQL üzerinde mevcut servis testleri, migration tekrarı ve ayrı veritabanına geri yükleme yerelde doğrulandı. Gerçek sunucuda aynı kapılar yeniden uygulanmalıdır. Ters vekil X-Forwarded-For/X-Real-IP başlıklarını temizleyip güvenilir IP yazmalıdır; aksi halde hız sınırı aşılabilir. Süreç içi sınır çoklu instance ve yeniden başlatmalarda ortak koruma sağlamaz.

CSP script için unsafe-inline içerir. Gerçek ödeme formunun CSP davranışı ve nonce yaklaşımı doğrulanmalıdır. SMTP, token bağlantılarının APP_URL/HTTPS doğruluğu, iyzico sandbox ve imzalı webhook aktivasyonu bekler.

Secret'ları sunucu secret deposunda tutun. Geliştirme loglarında tek kullanımlık e-posta bağlantıları bulunur; logları paylaşmayın. Yedek şifreleme, yetki, saklama/silme ve geri yükleme tatbikatı uygulanmalıdır. DEPLOYMENT.md prosedürdür; otomatik servis kurulmuş değildir.

## Bilinen riskler

Yalıtım uygulama düzeyindedir; RLS politikalarına dayanmaz. Paralel kota/koltuk yarışları ve çoklu instance yükü stres testine alınmadı. Senkron geometri hesabı büyük dosyada kaynak tüketebilir; ters vekilde gövde/bağlantı sınırı gerekir.

Webhook olay kaydı, abonelik güncellemesi ve denetim kaydı aynı kilitli işlemde yapılır; dönem bitişi sağlayıcının bildirdiği tarihten alınır ve geciken ödeme süresiz erişim vermez. Bunlar yalnızca taklit iyzico yanıtlarıyla test edildi; gerçek sağlayıcı hesabında doğrulanmadı. Tüm bildirimler kaçırılırsa çalışan otomatik bir uzlaştırma işi yoktur. Bunlar canlı ödeme kapılarıdır.

Hata raporunda gerçek çizim/kişisel veri yerine test örneği kullanın. Veri olayında erişimi kısıtlayın, kanıtı koruyun, etkiyi belirleyin ve bildirim yükümlülükleri için yetkili hukuki destek alın.
