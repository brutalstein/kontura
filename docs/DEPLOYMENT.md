# Dağıtım ve geri dönüş

Bu bir işletim kılavuzudur; yayına alınmış hizmet kanıtı değildir. Canlı komutlar alan/sunucu/hesap sahibi yetkilendirmesiyle yürütülmelidir. Yerel üretim derlemesi ve PGlite sağlık/genel sayfa kontrolü doğrulandı. Docker/PostgreSQL kapılarının durumu TEST_RESULTS.md içindedir.

## Ortamlar ve değişkenler

Geliştirme: `.env.local`, DATABASE_URL boşsa PGlite, isteğe bağlı test faturalaması. Staging: ayrı PostgreSQL, ayrı SMTP posta kutusu ve iyzico sandbox anahtar/planları. Üretim: ayrı veritabanı/secret'lar, gerçek APP_URL/HTTPS ve yalnızca onaylanmış iyzico canlı hesabı. Aynı firma verisini veya secret'ları ortamlar arasında paylaşmayın.

`.env.example` tam değişken referansıdır. Üretimde DATABASE_URL, APP_URL, SMTP_URL, MAIL_FROM, SUPPORT_EMAIL, LEGAL_ENTITY_NAME ve LEGAL_ENTITY_ADDRESS işletmeci tarafından doldurulmalıdır. Ödeme kapalı başlayabilir; satın alma engellenir. Etkinleştirmek için API/secret/merchant ve üç plan referansı, imzalı webhook aktivasyonu, sandbox kanıtı gerekir. BILLING_TEST_MODE ve ALLOW_EMBEDDED_DB üretimde kullanılmaz.

DB_POOL_MAX × instance sayısını veritabanı kapasitesi altında tutun. DB_MIGRATE_ON_START=false ile migration'ı tek release adımında çalıştırın. `pnpm db:migrate` DATABASE_URL yoksa hata verir; gömülü veritabanına sessizce geçmez. `.env.local` okunur; mevcut ortam değişkenleri önceliklidir. Başarılı komut yeniden çalıştırılabilmelidir; gerçek PostgreSQL idempotence CI adımı hazırlanmıştır.

## Docker Compose

Node 24 ve PostgreSQL 17 tabanları kullanılır. Nihai imajı doğruladıktan sonra digest ve release etiketiyle sabitleyin. Fontlar derlemede indirildiği için ağ gerekir. İmaj hiçbir `.env` veya yerel `.data` dosyasını içermez; uygulama node kullanıcısıyla çalışır.

`.env.example` kopyasını `.env.deploy` olarak oluşturun. Gerçek değerleri yerel dosyaya yazın; Git'e eklemeyin. POSTGRES_PASSWORD için rastgele, URL içinde güvenli alfasayısal parola kullanın; özel karakter varsa DATABASE_URL oluştururken URL kodlamasını ayrıca düzenleyin. KONTURA_IMAGE_TAG her release için değişmez bir etiket olmalıdır.

```bash
docker compose --env-file .env.deploy config --quiet
docker compose --env-file .env.deploy up -d --build
docker compose --env-file .env.deploy ps
```

Veritabanı hazır olduktan sonra tek kullanımlık migrate servisi çalışır; başarılı bitmeden app başlamaz. Uygulama yalnızca 127.0.0.1:3000 portuna bağlanır. Üretimde önüne HTTPS ters vekili koyun. İç ağ PostgreSQL portunu dışarı açmayın. Birden fazla instance'a geçmeden süreç içi hız sınırını değiştirin.

Ters vekil istemci IP başlıklarını temizleyip kendi doğruladığı adresi yazmalıdır. İstek boyutu/timeout koyun; portal JSON birden fazla DXF içerdiği için toplam gövde sınırını kullanım senaryosuyla test edin. Kullanıcı cookie'leri Secure olduğundan gerçek üretim oturumu HTTPS gerektirir.

## Doğrulama ve izleme

`/api/health` 200 ve status=ok olmalıdır; 503 veritabanı/açılış hatasını gösterir. Bu SMTP, ödeme, yedek veya kuyruk kontrolü değildir. Harici uptime alarmı ve sunucu log/CPU/bellek/disk/DB bağlantı alarmları ayrıca kurulmalıdır. Destek posta kutusu gerçekten izlenmelidir.

Staging'de kayıt/doğrulama/reset/davet, teklif/portal, iki firma yalıtımı, dosya/export/silme, sandbox ödeme/iptal/webhook tekrarları ve yedekten dönüş kapılarını tamamlayın. CI dosyası hazırlanmıştır; uzaktan çalışması ayrıca gözlenmelidir.

## Yedek ve geri yükleme

Aşağıdaki örnekler Bash içindir. Gerçek veride yalnızca yetkili işletmeci uygular. Her gün şifreli, uygulama sunucusu dışında yedek ve 14 günlük saklama önerilen ilk politikadır; kurulmuş bir zamanlayıcı değildir. Hedef RPO 24 saat/RTO 2 saattir, tatbikatla ölçülmedi. Kişisel veri silme kayıtlarını ayrı tutun ve geri yükleme sonrasında tekrar uygulayın.

```bash
docker compose --env-file .env.deploy exec -T db pg_dump -U kontura -d kontura -Fc > kontura-backup.dump
docker compose --env-file .env.deploy exec -T db pg_restore --list < kontura-backup.dump
docker compose --env-file .env.deploy exec -T db createdb -U kontura kontura_restore_check
docker compose --env-file .env.deploy exec -T db pg_restore -U kontura -d kontura_restore_check --no-owner --exit-on-error < kontura-backup.dump
```

Listelemek geri yükleme kanıtı değildir. Ayrı restore veritabanında kullanıcı/firma/teklif/dosya adetlerini ve uygulama akışını doğrulayın. Testi hiçbir zaman canlı veritabanının üzerine yapmayın. Yedek erişimi ayrı yetkiyle ve şifreleme anahtarıyla korunmalıdır.

## Geri dönüş

Release öncesi imaj etiketi, migration sürümü ve doğrulanmış yedek kaydedilir. Migration'lar önce staging'de denenir. Şema uyumluysa önceki imajı çalıştırıp sağlık/oturum/teklif akışını kontrol edin. Compose build'in eski etiketi ezmemesi için geri dönüşte `--build` kullanmayın; sunucuda korunmuş önceki etiketi seçin. Şema uyumsuzsa yazıları durdurun, ayrı veritabanına yedeği yükleyin, önceki uygulamayla doğrulayın ve bağlantıyı kontrollü değiştirin. Otomatik down migration yoktur; veri kaybı olasılığını işletmeci değerlendirmelidir. `down -v` kullanmak kalıcı veriyi siler.
