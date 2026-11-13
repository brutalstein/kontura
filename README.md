# Kontura

Fason sac kesim atölyeleri için DXF analizi, maliyet hesabı, teklif bağlantısı ve sipariş takibi. Türkçe arayüz; Next.js, React, TypeScript ve PostgreSQL. Geliştirmede ayrıca sunucu kurmadan PGlite kullanılır.

## Yerel çalıştırma

Node.js 24 ve pnpm 10.15.0 kullanın. Bu oturum Node 24.11.0 üzerinde doğrulandı.

Depo içinde tek komut:

```powershell
node scripts/dev.mjs
```

Bu çalışma klasörünün kökünde `..\dev.cmd` de aynı başlatıcıyı çalıştırır (çift tıklanabilir). `pnpm dev` eşdeğerdir. Başlatıcı kilitli bağımlılıkları kurar, `.env.local` yoksa örneğinden oluşturur, 3000 portunu kontrol eder, sunucuyu başlatır ve veritabanı/migration sağlık kontrolü başarılı olunca adresi gösterir. Mevcut `.env.local` ve veriler korunur. Node.js 24 ve Corepack PATH içinde bulunmalıdır; ayrı Docker veya PostgreSQL kurulumu yerel çalışma için gerekmez. Durdurmak için Ctrl+C kullanın.

[Yerel uygulama](http://localhost:3000) üzerinden kayıt olun ve makine/malzeme kurulumunu tamamlayın. Başlatıcı PostgreSQL için yalnızca `.env.local` içindeki DATABASE_URL değerini kullanır; başka bir projeden miras kalan sistem değişkenini kullanmaz. Değer boşsa veriler `.data/pglite` altında saklanır. Bu dizini silmek yerel veriyi siler; aynı dizini iki süreçte açmayın. Yerel PostgreSQL seçerseniz migration'lar bu veritabanına uygulanır; yalnızca bu projeye ayırdığınız bağlantıyı yazın.

SMTP_URL yoksa geliştirme e-postaları sunucu konsolunda gösterilir; gerçek e-posta gönderilmez. BILLING_TEST_MODE=true geliştirmede ödeme almadan plan denemeyi sağlar. TEST MODU arayüzde görünür; üretimde bu bayrak yok sayılır.

## Kontroller

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm e2e
pnpm build
```

Yerel E2E kurulu Chrome'u, CI Chromium'u kullanır. Testler 3101 portunda kendi sunucusunu, `.next-e2e` çıktısını ve `.data/e2e` veritabanını kullanır. 3000 portundaki geliştirme sunucusuna veya `.data/pglite` kayıtlarına yazmaz; mevcut bir test sunucusunu da yeniden kullanmaz. Testte SMTP ve gerçek ödeme anahtarları kapalıdır. Test sırasında kaynak değiştirmeyin.

Üretim tarayıcı kontrolleri için yalnızca geçici verili, SMTP yapılandırılmış yerel Docker kurulumunda `RUN_DISPOSABLE_PRODUCTION_E2E=true` ayarlayıp `pnpm exec playwright test --config playwright.production.config.ts` çalıştırın. Bu komut localhost:3000 üzerindeki kuruluma örnek hesap/teklif ekler; üretim ödeme simülatörünün kapalı olduğunu da doğrular. Gerçek kullanıcı verisiyle çalıştırmayın. Tekrar koşmadan önce geçici app sürecini yeniden başlatın; saatlik kayıt sınırı tekrarlarla tüketilebilir.

Servis testlerini gerçek PostgreSQL üzerinde çalıştırmak için TEST_DATABASE_URL ayarlayıp `pnpm test` çalıştırın. Bu bağlantı yalnızca test sunucusuna gitmelidir; rol geçici veritabanı oluşturma/silme yetkisine sahip olmalıdır. Her suite ayrı DB oluşturur ve sonunda siler; DATABASE_URL kullanılmaz.

PostgreSQL migration: `pnpm db:migrate`. Yönetici: `pnpm admin kullanici@example.com`; geri almak için `--revoke`. Kullanıcı önce kayıt olmalıdır. Her iki komut `.env.local` dosyasını okur; ortam değişkenleri önceliklidir. PGlite kullanırken admin komutundan önce geliştirme sunucusunu durdurun.

## Teslim durumu

Yerel akışlar, güncel Docker üretimi, yerel SMTP yakalama ve yedekten dönüş doğrulandı. Canlı yayın, dış alıcıya SMTP teslimi ve iyzico aktivasyonu yapılmadı. Ayrıntılar: [proje durumu](docs/PROJECT_STATUS.md), [test kanıtları](docs/TEST_RESULTS.md), [dağıtım](docs/DEPLOYMENT.md), [sınırlamalar](docs/KNOWN_LIMITATIONS.md).
