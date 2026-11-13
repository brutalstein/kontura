# Canlı kabul testi — 13 Kasım 2026

Ortam: https://kontura.ustacenker16.workers.dev (Cloudflare Workers Free + Hyperdrive + Supabase Free). Test, hesap sahibinin kendi oturumunda ve oturumsuz ayrı bir tarayıcıda (müşteri ve portal ziyaretçisi rolü) elle yürütüldü. Otomatik test değildir; aşağıdaki sayılar ekrandan okunmuş, beklenen değerler bağımsız olarak elle hesaplanmıştır.

## Girdiler

Çizimler `dxf/` klasöründedir ve `npx tsx scripts/acceptance-fixtures.ts` ile yeniden üretilir. Betik her parçanın elle hesaplanmış kesim boyunu, net alanını ve delme sayısını da yazar.

| Parça | Kaynak | Malzeme | Kalınlık | Adet |
| --- | --- | --- | --- | --- |
| Düz flanş DN50 PN16 | EN 1092-1 Tip 01 ölçüleri: D 165, K 125, 4 × Ø18, delik 61,5 | DKP / siyah sac | 18 mm | 20 |
| Köşe braketi 160 × 60, 4 × Ø9, 1 büküm | atölye tipi parça | DKP / siyah sac | 3 mm | 200 |
| Pano kapağı 400 × 300 R10, pencere ve 6 havalandırma kanalı | atölye tipi parça | Galvaniz sac | 1,5 mm | 50 |
| Kolon taban plakası 250 × 250, 4 × Ø22, orta Ø100 | atölye tipi parça | DKP / siyah sac | 10 mm | 12 |
| Üçgen berkitme 150 × 150 | atölye tipi parça | Paslanmaz 304 | 2 mm | 80 |

Fiyat ve tarife girdileri:

| Girdi | Değer | Niteliği |
| --- | --- | --- |
| DKP sac | 42,00 ₺/kg | Kasım 2026 web liste fiyat aralığı 41,80–44,56 ₺/kg içinden seçildi (KDV hariç toptan; kaynak tarihleri karışık) |
| Galvaniz sac | 41,21 ₺/kg | Web liste fiyatı, 1 mm, KDV hariç toptan |
| Paslanmaz 304 | 161,45 ₺/kg | Web liste fiyatı, 1 mm, Kasım 2026, KDV hariç |
| Alüminyum 5754 | 150,00 ₺/kg | Varsayım; güvenilir güncel kaynak bulunamadı, testte kullanılmadı |
| Makine dakika ücreti | 45 ₺/dk | Varsayım |
| Kesim tablosu | Uygulamanın 6 kW başlangıç tablosu | Örnek değerler; gerçek makineyle kalibre edilmedi |
| Kâr %25, KDV %20, büküm 15 ₺ + 250 ₺ kurulum, kenar 10 mm, parça arası 5 mm | Uygulama varsayılanları | Varsayım |

Bu fiyatlar piyasa verisi iddiası değildir; hesabın doğruluğunu sınamak için seçilmiş girdilerdir.

## Geometri: beklenen ve okunan

| Parça | Kesim boyu elle | Uygulama | Delme elle | Uygulama | Net ağırlık elle | Uygulama |
| --- | --- | --- | --- | --- | --- | --- |
| Flanş | 937,77 mm | 938 mm | 6 | 6 | 2,458 kg | 2,458 kg |
| Köşe braketi | 553,10 mm | 553 mm | 5 | 5 | 0,220 kg | 0,22 kg |
| Pano kapağı | 2.379,33 mm | 2.379 mm | 12 | 12 | 1,281 kg | 1,281 kg |
| Taban plakası | 1.590,62 mm | 1.591 mm | 6 | 6 | 4,170 kg | 4,17 kg |
| Berkitme | 512,13 mm | 512 mm | 1 | 1 | 0,178 kg | 0,178 kg |

## Fiyat: beklenen ve okunan

Makine maliyeti = (kesim boyu / ilerleme + delme × (delme süresi + 0,5 sn) / 60) × 45 ₺ × adet. 18 mm için tablo 15 mm (1.200 mm/dk, 2,5 sn) ile 20 mm (800 mm/dk, 4 sn) arasında doğrusal ara değerlenir: 960 mm/dk, 3,4 sn.

| Kalem | Makine elle | Uygulama | Malzeme (uygulama) | Malzeme kontrolü | Kâr elle | Kalem toplamı |
| --- | --- | --- | --- | --- | --- | --- |
| Flanş × 20 | 1.230,16 | 1.230,16 | 4.673,50 | 3 sıra × 165 + 2 × 5 + 20 = 525 mm şerit → 111,27 kg × 42 = 4.673,50 ✔ | 1.475,91 | 7.379,57 |
| Köşe braketi × 200 | 1.222,23 | 1.222,23 | 2.195,80 | 52,28 kg; yerleşim elle türetilmedi, doluluk %86 ile tutarlı | 1.667,01 | 8.335,05 (büküm 3.250,00 dahil ✔) |
| Pano kapağı × 50 | 525,26 | 525,26 | 3.894,11 | 94,49 kg, 2 plaka; yerleşim elle türetilmedi | 1.104,84 | 5.524,22 |
| Taban plakası × 12 | 537,47 | 537,47 | 3.857,49 | 3 sıra × 250 + 2 × 5 + 20 = 780 mm şerit → 91,85 kg × 42 = 3.857,49 ✔ | 1.098,74 | 5.493,70 |
| Berkitme × 80 | 157,23 | 157,23 | 5.415,66 | 9 sıra × 150 + 8 × 5 + 20 = 1.410 mm şerit → 33,54 kg × 161,45 = 5.415,66 ✔ | 1.393,22 | 6.966,12 |

Ara toplam 33.698,66 ₺, KDV 6.739,73 ₺, genel toplam 40.438,39 ₺. Beş kalemin toplamı ve KDV elle doğrulandı.

## Akış sonuçları

| Adım | Sonuç |
| --- | --- |
| Kayıt (hesap sahibi kendisi yaptı) | Başarılı; POST /kayit 152 ms CPU |
| Kurulum: 6 kW lazer, dört malzeme | Kaydedildi; ondalık virgüllü fiyatlar doğru saklandı |
| Müşteri ekleme, teklife bağlama, not | Kaydedildi |
| Beş DXF'i birlikte yükleme | Beş kalem oluştu, analiz yukarıdaki tabloyla uyumlu |
| Parça listesi yapıştırma (ad; adet; kalınlık; malzeme) | "5 kalem güncellendi"; beş kalemin alanları doğru doldu |
| Açık konturlu hatalı çizim | Uyarı gösterildi, teklif toplamı "fiyat hesaplanamaz" ile durdu; kalem silinince toplam geri geldi |
| Teklifi gönderme | Durum "Gönderildi", paylaşım bağlantısı üretildi; e-posta gönderilmedi (SMTP yok) |
| Müşteri görünümü, oturumsuz tarayıcı | Kalemler ve toplam doğru; maliyet dökümü ve kâr görünmüyor |
| Müşteri onayı | Durum "Onaylandı"; panelde 40.438,39 ₺ tutarlı sipariş açıldı |
| Sipariş durumu, termin, üretim notu | Kaydedildi ve sayfa yenilenince korundu |
| Müşteri portalı, oturumsuz ziyaretçi | Örnek çizim yüklendi; 1 mm × 1 adet tahmini 435,95 ₺ (elle: makine 4,63 + malzeme 79,13 + büküm 265,00, %25 kâr ✔) |
| Portal talebi | Talep no #2, panelde taslak teklif olarak 4.208,17 ₺ ile göründü |
| Portalı kapatma | Adres 404 döndü; portal testten önceki gibi kapalı bırakıldı |
| Veri dışa aktarma | 200; 2 teklif, 6 kalem, 1 sipariş, 4 malzeme, 1 makine |
| Worker logları | Test boyunca 273 istek, hepsi `ok`, istisna yok; medyan 8 ms, en yüksek 516 ms CPU |

## Testin bulduğu ve düzeltilen sorunlar

1. Kısmi dolu plakada yerleşim, tam plaka için en iyi karışık deseni kullanıyordu. 40 adet 240 × 140 parçada 995 mm yerine 1.030 mm şerit faturalanıyordu (malzemede yaklaşık %3,5 fazla). `src/engine/nesting.ts` artık kısmi plakada tek yönlü dizilimi de dener; `tests/engine/nesting-costing.test.ts` içinde regresyon testi var.
2. Delik çapı sac kalınlığına eşitken (flanşta 18 mm) "kalınlıktan küçük" uyarısı çıkıyordu. Uyarı artık yalnızca delik gerçekten küçükse gösterilir.
3. Uzak CI, gerçek PostgreSQL testinde geçici veritabanı silinirken kapanmakta olan bağlantının hatası yüzünden kırmızıydı. Test yardımcısı bu hatayı artık yakalıyor.

Düzeltmeler aynı gün yeniden dağıtıldı ve canlıda doğrulandı. Portaldan gelen 2 numaralı taslak (40 adet, 3 mm) düzeltmeden önce 3.506,81 ₺ idi; kalem yeniden kaydedilince 3.441,90 ₺ oldu (makine 427,29 + malzeme 1.476,23 + büküm 850,00, %25 kâr; KDV dahil 4.130,28 ₺). Bu, elle hesapla kuruşu kuruşuna aynıdır. Taslak tekliflerin fiyatı kalem kaydedildiğinde yeniden hesaplanır; yeniden kaydedilmeyen eski taslak eski tutarını gösterir.

Canlıdaki 1 numaralı teklif düzeltmeden önceki sürümle hesaplanıp onaylandı; onaylı teklifin tutarı değişmez.

## Bu testin kapsamadıkları

Giriş (şifreyle oturum açma) ve şifre değiştirme, ekip daveti ve rol kısıtları, parça hafızası ve adet alternatifleri, işlem kataloğu, müşteri malzemesi, veri silme, ödeme ve e-posta canlıda denenmedi. Bunlar yerel otomatik testlerle kapsanır (TEST_RESULTS.md). Eşzamanlı kullanıcı yükü ve mobil cihaz denenmedi. Kesim süreleri gerçek bir makinede ölçülmedi.
