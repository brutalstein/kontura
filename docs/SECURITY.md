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

## Yayın öncesi

PostgreSQL üzerinde mevcut servis testleri, migration tekrarı ve ayrı veritabanına geri yükleme yerelde doğrulandı. Gerçek sunucuda aynı kapılar yeniden uygulanmalıdır. Ters vekil X-Forwarded-For/X-Real-IP başlıklarını temizleyip güvenilir IP yazmalıdır; aksi halde hız sınırı aşılabilir. Süreç içi sınır çoklu instance ve yeniden başlatmalarda ortak koruma sağlamaz.

CSP script için unsafe-inline içerir. Gerçek ödeme formunun CSP davranışı ve nonce yaklaşımı doğrulanmalıdır. SMTP, token bağlantılarının APP_URL/HTTPS doğruluğu, iyzico sandbox ve imzalı webhook aktivasyonu bekler.

Secret'ları sunucu secret deposunda tutun. Geliştirme loglarında tek kullanımlık e-posta bağlantıları bulunur; logları paylaşmayın. Yedek şifreleme, yetki, saklama/silme ve geri yükleme tatbikatı uygulanmalıdır. DEPLOYMENT.md prosedürdür; otomatik servis kurulmuş değildir.

## Bilinen riskler

Yalıtım uygulama düzeyindedir, RLS yoktur. Paralel kota/koltuk yarışları ve çoklu instance yükü stres testine alınmadı. Senkron geometri hesabı büyük dosyada kaynak tüketebilir; ters vekilde gövde/bağlantı sınırı gerekir.

Webhook olay kaydı ve abonelik güncellemesi atomik değildir. Kesinti ve olay sıralaması ayrıca ele alınmalıdır. Yenileme tarihi 30 gün eklenerek tahmin edilir; gerçek sağlayıcı dönem bilgisiyle uzlaştırılmadan takvim ayı doğruluğu iddia edilmemelidir. `past_due` erişimi otomatik son tarihle kapanmaz. Bunlar canlı ödeme kapılarıdır.

Hata raporunda gerçek çizim/kişisel veri yerine test örneği kullanın. Veri olayında erişimi kısıtlayın, kanıtı koruyun, etkiyi belirleyin ve bildirim yükümlülükleri için yetkili hukuki destek alın.
