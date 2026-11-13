# Test kanıtları

## Son Codex devamının güncel sonuçları — 12 Kasım 2026

Windows, Node.js 24.11.0, pnpm 10.15.0. Aşağıdaki sonuçlar bu devamda gerçekten çalıştırıldı. Daha aşağıdaki eski oturum kanıtları tarihseldir; güncel sayılar bu tablodadır.

| Kontrol | Komut / yöntem | Güncel sonuç |
| --- | --- | --- |
| PGlite birim/servis/script | TEST_DATABASE_URL boş, `pnpm test` | 10 dosya, 90/90 test, çıkış 0 |
| PostgreSQL 17 | TEST_DATABASE_URL ayrı `kontura-readiness-pg` konteyneri, suite başına geçici DB, `pnpm test` | 10 dosya, 90/90 test, çıkış 0 |
| Statik kontroller | `pnpm lint`, `pnpm typecheck` | 0 lint hatası, 40 önceden var olan uyarı; tip kontrolü çıkış 0 |
| Geliştirme tarayıcısı | `pnpm e2e` | 14/14, 1,0 dakika; ayrı 3101 portu/.next-e2e/.data/e2e |
| Üretim tarayıcısı | RUN_DISPOSABLE_PRODUCTION_E2E=true, `pnpm exec playwright test --config playwright.production.config.ts` | Docker/PostgreSQL/SMTP üzerinde son koşu 14/14, 25,2 saniye; geliştirme sunucusu başlatılmadı; ödeme test modu üretimde görünmedi |
| Üretim derlemesi | `pnpm build`; ayrıca güncel Docker build | İkisi de çıkış 0 |
| Docker kurulum | `docker compose --env-file .env.deploy -p kontura-readiness-codex up -d --build` | Migration 0000–0002 çıkış 0; app ve DB healthy; app UID 1000; sağlık 200; anonim export 401; üretim CSP/nosniff/HSTS mevcut |
| Migration | PostgreSQL'de `pnpm db:migrate` iki kez; ayrıca image migrate tekrarı | Çıkış 0; DATABASE_URL boşken beklenen çıkış 1 |
| SMTP | Üretim uygulaması → yerel Mailpit; HTTP API ile mesajlar okundu | Üç başarılı üretim suite'i boyunca toplam 27 mesaj yakalandı; dış alıcı teslimi değildir |
| Yedekten dönüş | Güncel Docker DB'de pg_dump -Fc → ayrı restore DB → pg_restore --exit-on-error | Başarılı; yedek anındaki kullanıcı/teklif/sipariş sayıları iki DB'de 10/12/4 |
| Tek başlatma komutu | Üst klasörden `dev.cmd`; otomatik bağımlılık kurulumu, sağlık, Ctrl+C, yeniden başlatma | Sağlık 200; Ctrl+C ardından 3000 portu boş; tekrar başlatma başarılı. .env.local SHA-256 değişmedi |
| Başlatıcı regresyonu | `tests/scripts/dev.test.ts`, gerçek çocuk süreçte Next env yüklemesi | 3/3; yabancı DATABASE_URL yalıtımı, yerel bağlantı, değişken genişletmesi, kaçışlı dolar ve dosya koruması |
| Kod grafiği | `graphify update .` | AST yenilemesi başarılı: 815 düğüm/2340 kenar. SQL grammar kurulu olmadığı için 3 SQL dosyası AST kapsamı dışında; migration'lar gerçek DB'de ayrıca test edildi |
| Yerel skill | Yerel codex-max SKILL.md, Skill Creator quick_validate | Geçti; resmi/üçüncü taraf bir paketin kurulumu değildir |

Ödeme regresyonları önce eski davranışta altı başarısız testle yeniden üretildi, sonra düzeltildi. Olay kaydı/firma/audit atomikliği audit INSERT'ini gerçekten reddeden DB trigger'ıyla sınandı; hem PGlite hem PostgreSQL'de geri alma ve aynı olayı tekrar işleme geçti. Aynı siparişin farklı olay kimlikleriyle gelmesi, eşzamanlı bildirimler, gecikmiş başarısızlık, iptal sonrası başarı, sağlayıcı kesintisi, tutarsız sağlayıcı yanıtı, checkout'tan önce gelen olay ve ücretli dönem bitişi sınandı. Sağlayıcı yanıtları bu testlerde taklittir; canlı tahsilat yapılmadı.

Başlatıcı incelemesi değişken genişletmesini ve kaçışlı doların ikinci kez genişletilmesini yakaladı. Regresyonlar önce başarısız, sonra Next'in kendi yükleyicisi ve işlenmiş ortam işaretiyle başarılı oldu. Bağımsız dar kapsamlı tekrar incelemesi düzeltmeyi doğruladı.

Üretim suite'inin üçüncü ardışık denemesi saatlik 10 kayıt sınırına takıldı ve durduruldu. Bu bir ödeme/DB hatası değildi: aynı süreçteki önceki iki koşu kotayı tüketmişti. Yalnızca geçici app süreci yeniden başlatıldı; hız sınırı kapatılmadan son suite 14/14 geçti. Yapılandırma ayrıca Playwright'ın config birleştirmesinin geliştirme webServer'ını tutmaması için tek nesneyle kuruldu; son koşuda webServer=[] doğrulandı.

Geçici PostgreSQL, Mailpit, Docker Compose konteynerleri/volume'ü ve oluşturulan .env.deploy temizlendi. Kullanıcının .data/pglite verisi ve .env.local dosyası korundu; geliştirme uygulaması localhost:3000 üzerinde çalışır bırakıldı. pnpm esbuild build-script, Vite __dirname ve pg eşzamanlı client.query ileri sürüm uyarıları sürüyor; doğrulanan komutları başarısız kılmadılar.

Canlı iyzico sandbox/canlı ödeme, dış SMTP teslimi, gerçek HTTPS, harici dağıtım/izleme, uzaktan CI, dağıtık yük, bağımsız güvenlik ve erişilebilirlik denetimleri yapılmadı. KNOWN_LIMITATIONS.md geçerli yayın sınırlarını açıklar.

---

## Önceki oturumun tarihsel kanıtları

Tarih: 12 Kasım 2026. Windows, Node.js 24.11.0, pnpm 10.15.0. Sonuçlar gerçekten çalıştırılan komutlardır. İlk altı satır, parça hafızası, işlem kataloğu ve toplu düzenleme eklendikten sonraki son çalıştırmadır. Docker dağıtımı, imaj, migration tekrarı/koruması, yedekten dönüş ve yerel üretim satırları bir önceki oturumdandır; bu özelliklerden sonra yeniden çalıştırılmadı.

| Kontrol | Komut / yöntem | Sonuç |
| --- | --- | --- |
| Birim ve servis, PGlite | `npx vitest run` | 9 dosya, 81 test geçti |
| Gerçek PostgreSQL 17 | Geçici `postgres:17-bookworm` konteyneri (127.0.0.1:55432), TEST_DATABASE_URL ile `npx vitest run` | 9 dosya, 81 test geçti, çıkış 0; 0000-0002 migration'ları her suite için ayrı geçici DB'de yürütüldü; konteyner test sonunda silindi |
| Statik kontrol | `pnpm lint` | 0 hata, 40 kullanılmayan değişken uyarısı |
| Tip denetimi | `npx tsc --noEmit` | Çıkış 0 |
| Tarayıcı | `npx playwright test`, yerel Chrome, nihai tekrar | 14 test geçti, 1,1 dakika |
| Üretim derlemesi | ALLOW_EMBEDDED_DB=true `pnpm build` | Çıkış 0 |
| Yerel üretim/PGlite | `next start -p 3100`, ALLOW_EMBEDDED_DB=true | Sağlık ve /, /fiyatlar, /giris, /yasal/kvkk 200; JSON sağlık ok; oturumsuz export 401; CSP/nosniff mevcut |
| Docker dağıtımı | `docker compose --env-file .env.deploy -p kontura-verify up -d --build` | İmaj derlendi, migration 0 ile bitti, app ve PostgreSQL healthy |
| Nihai Docker imajı | Corepack ortak önbelleğiyle yeniden build/up; HTTP smoke | Migration 0; sağlık/genel sayfalar 200, anonim export 401; UID 1000, imajda env ve yerel veri yok |
| Migration tekrar | Aynı PostgreSQL üzerinde `compose run --rm migrate` | Çıkış 0; tekrar çalıştırılabildi |
| Migration koruması | DATABASE_URL boşken `pnpm db:migrate` | Beklenen çıkış 1; gömülü DB'ye düşmeden hata |
| Yedekten dönüş | pg_dump custom format → ayrı kontura_restore_check DB → pg_restore --exit-on-error | Başarılı; sentetik kullanıcı kaydı geri okundu |
| Kaynak temizliği | `git diff --check` | Hata yok; Windows satır sonu uyarıları var |

## Tarayıcı kapsamı

Anonim panel/API/yönetim engeli; kayıt → makine/malzeme kurulumu → DXF yükleme/fiyat → paylaşım → müşterinin onayı → sipariş; başka firmanın teklif okuma/yükleme engeli; farklı origin POST reddi; müşteri portalı tahmin/talep; ayarlar/destek; doğru/yanlış parola girişi.

Parça hafızası: müşteri → parça kaydet → tekrar teklif → fark → adet alternatifi seçimi → sipariş. İşlem kataloğu: ondalık virgüllü fiyatla işlem tanımlama, kaleme işlem miktarı ve müşteri malzemesi girme, iç dökümde tutarın doğrulanması, müşteri sayfasında yalnızca kapsam metninin görünmesi ve birim fiyat/tutarın görünmemesi. Toplu düzenleme: iki kaleme tek adımda kalınlık atama, yapıştırılan parça listesinden adet/kalınlık eşleme, eşleşmeyen satırın bildirilmesi, okunamayan satırda hiçbir kalemin değişmemesi.

375/768/1440 piksel, açık/koyu tema için altı test /, /fiyatlar, /giris, /kayit ve /yasal/kvkk sayfalarının HTTP durumunu, başlığını, yatay taşmasını ve tarayıcı hatalarını kontrol eder. Ana sayfa/giriş görüntüleri test-results/visual-* altında, iş akışı görüntüleri E2E_SHOTS ayarlandığında test-results/app-screens altındadır. Bunlar Git'e girmez.

İşlemler ayar sekmesi, işlemli teklif kalemi (1280 ve 375 piksel) ve toplu düzenleme paneli (1280 piksel) görüntüleri açık temada görsel olarak incelendi; koyu temada incelenmedi. Teklif fiyat ekranı, portal tahmini ve mobil koyu ana sayfa görüntüleri görsel olarak incelendi; kontur kalınlığı ve yerleşim düzgün göründü. Bu kapsamlı erişilebilirlik veya piksel referans karşılaştırması değildir.

Docker doğrulaması `kontura-verify` adlı ayrı proje/volume ve ayrı servis testi konteyneriyle yapıldı. Bu oturumun oluşturduğu geçici konteyner/volume/env dosyası test sonunda temizlendi; yerel `.data/pglite` korundu. Docker Desktop başlatılmış durumda bırakıldı.

## Yakalanan sorunlar ve tekrar kanıtı

- İlk lint: 9 hata. JSX apostrofları, uygulama içi bağlantılar, değişmeyen let ve portal effect durum güncellemesi düzeltildi. Sonraki lint hata vermedi.
- İlk E2E giriş yönlendirmesi başka gezinmeyle yarıştı. Yönetim erişimi ayrı sekmeye taşındı. Ardından sürekli HMR yenilemesi kayıt formunu sıfırladı. Tailwind taraması src ile sınırlandı; sonraki kayıt akışı geçti.
- Portal regresyonu önce başarısız oldu: adet 2 seçiliyken geciktirilen yeni yanıt sırasında eski 1 adet fiyatı görünüyordu. Sonuç seçimle eşleştirildi; eski yanıtlar effect temizliğinde geçersiz kılındı. Aynı test sonra geçti.
- Ekran görüntüsü aracının geçici caret stilinin erken hydration'a karıştığı görüldü; görüntü ayarı caret=initial yapıldı.
- Docker ilk çalıştırmada kapalıydı; başlatıldı. İlk imaj root olmayan kullanıcıda pnpm'yi yeniden indirdi; Corepack önbelleği ortak konuma taşındı.
- Son PGlite tekrarında ortamdan gelen TEST_DATABASE_URL nedeniyle kapatılmış bir PostgreSQL bağlantısı denendi ve üç suite kurulamadı. Bu değişken açıkça boşaltılarak yeniden çalıştırıldı: 62 test geçti. Bağlantı başarısızlığında gömülü DB'ye sessiz geçiş yapılmadı.

- Sayı alanları ondalık virgülü kabul etmiyordu ("42,5" hata veriyordu). Form eylemlerinde virgül noktaya çevrildi; tarayıcı testi "42,5", "250,50" ve "0,07" ile geçti.
- Toplu düzenleme testi önce başarısız oldu: sunucu adetleri güncellediği halde kalem formlarındaki alanlar eski değeri gösteriyordu ve otomatik kaydeden form bu eski değeri geri yazabilirdi. Toplu eylem başarıyla bitince kalem formları yeniden kuruluyor; aynı test sonra geçti.
- Gerçek PostgreSQL çalıştırması 81 test geçtiği halde çıkış 1 verdi: süresi dolan deneme testinde dört çağrı aynı anda başlatılıp sırayla beklendiği için yakalanmamış ret oluşuyordu. Çağrılar sıraya alındı; tekrar çalıştırma çıkış 0 verdi.
- Kaynak dosya değişikliğinden hemen sonra tek bir tarayıcı testi soğuk geliştirme sunucusunda iki kez kayıt adımında zaman aşımına uğradı (sayfa sürekli yenilendi). Hemen ardından tekrar çalıştırma geçti; iki ayrı yeniden üretme denemesinde sorun oluşmadı ve tam suite'te hiç görülmedi. Kök neden bulunmadı.
- Geliştirme makinesinin ortamındaki DATABASE_URL bu projeyle ilgisiz bir veritabanını gösteriyordu; geliştirme sunucusu migration'ı orada denedi, bağlantı reddedildi ve hiçbir şey yazılmadı. Önizleme ayarı, Playwright sunucusu ve tüm komutlar bu değişkeni boşaltarak çalıştırıldı.

## Performans gözlemi

Tek yerel süreçte örnek DXF analizi 100 tekrar toplam 18 ms; 1.000 adet 240×140 mm dikdörtgeni 3000×1500 mm plakaya yerleştirme 2 ms, 9 plaka. Bunlar tek ölçüm ve küçük/sentetik girdi sonuçlarıdır; HTTP kapasitesi, büyük DXF, p95/p99 veya üretim SLA kanıtı değildir.

## Doğrulanmayanlar

Canlı yayın, gerçek SMTP teslimi, iyzico sandbox/canlı tahsilat, gerçek HTTPS oturumu, uzaktan CI çalışması, bağımsız sızma testi, ekran okuyucu denetimi, uzun süreli/dağıtık yük ve webhook kesinti/sıralama senaryoları. KNOWN_LIMITATIONS.md kalan kapıları listeler.

Kod grafiği bir önceki oturumda yenilenmişti; Graphify sonradan kaldırıldığı için işlem kataloğu ve toplu düzenleme değişikliklerinden sonra yenilenmedi.
