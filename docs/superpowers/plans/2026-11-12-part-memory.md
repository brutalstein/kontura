# Parça hafızası ve adet alternatifleri Implementation Plan

> Tek ajanla, mevcut checkout üzerinde yürütülür. Kullanıcı araştırmadaki önerilerin uygulanmasını istedi; ilk teslim öncelikli pakettir. Ponytail, migration, TDD ve executing-plans uygulanır. Mevcut değişiklikler korunur; commit/yayın yoktur.

**Goal:** Tekrar gelen parçayı revizyonuyla bulmak, güncel fiyatın önceki maliyet bileşenlerinden farkını göstermek ve müşterinin dondurulmuş adet alternatifini onaylayabilmesi.

**Architecture:** Mevcut fiyat motoru ve server action'lar kullanılır. Müşteri bazlı değişmez partRevisions tablosu; quoteItems üzerinde kod/revizyon/kaynak fiyat kopyası; quotes üzerinde dondurulabilir adet seçenekleri. Yeni bağımlılık veya harici servis yoktur.

**Tech Stack:** Next.js/React, TypeScript, Drizzle/PostgreSQL/PGlite, Vitest ve Playwright.

## Tasarım kararları

- Kütüphane kaydı seçilmiş müşteriye aittir. Aynı müşteri/kod/revizyon tekrar kaydedilirse üzerine yazılmaz; farklı çizim için yeni revizyon gerekir. Adet veya fiyat değişikliği çizim revizyonu değildir; tekrar kaydetmede ilk reçete/fiyat korunur. Firma yalıtımı ve owner/admin/estimator yazma yetkisi zorunludur.
- Kayıt DXF/analiz/reçete/önceki maliyet kopyasını saklar. Teklif veya dosya silinmesi kayıtlı revizyonu bozmaz. Yeni teklife eklerken bağımsız dosya oluşturulur ve güncel katalogla hesaplanır. Silinmiş katalog girdisi otomatik başka malzemeye çevrilmez.
- Fiyat farkı birim başına makine/malzeme/büküm/ek işlem/hazırlık/kâr/indirim katkılarıdır. Farklı adet ve tarife tarihi açık gösterilir; tarife değişikliğinin neden olduğu varsayılmaz. Bu karşılaştırma müşteriye açık değildir.
- En fazla üç alternatif, tüm teklif kalemleri için açık adetler içerir. Her biri bütün teklif olarak fiyatlanır; nesting, hazırlık, minimum iş ve KDV ayrı ayrı hesaplanır. Alternatifler gönderimde tekrar hesaplanıp donar. Müşteri seçiminde mevcut katalog kullanılmaz; seçilen miktarlar ve dondurulmuş sonuçlar transaction içinde siparişe aktarılır.
- Eski kayıtlar boş kod/revizyon ve boş alternatiflerle çalışmaya devam eder. Migration yalnız ekleyicidir; eski sürüme uygulama dönüşü için yeni sütun/tablo yerinde kalabilir. Veri silen down migration uygulanmaz.
- İlk teslim tam eşleşme/parça kodu aramasıdır; rakiplerde bulunmadığı iddia edilmez. Farklılaşma hedefi tekrar işte fiyat farkını açıklayan akıştır. Sonraki araştırma paketleri ayrı teslimlerdir: toplu listeler/teknik talep, işlem kataloğu, üretim paketi, stok/termin.

## Görevler ve doğrulama

- [x] 1. Servis testlerini yaz ve başarısızlığı gözle: revizyon değişmezliği, müşteri/firma/rol/plan sınırları, güncel tarifeyle tekrar teklif ve kaynak silme; alternatifin tam hesaplanması, fiyatın donması, seçimin atomik uygulanması ve maliyet gizliliği.
- [x] 2. schema.ts için ekleyici migration üret; quotes.ts ve yeni parts.ts servislerini uygula; privacy export'a kütüphaneyi dahil et. Mevcut 62 testi ve yeni testleri çalıştır.
- [x] 3. Parça hafızası sayfası, teklif ekranında kaydet/ekle/karşılaştır ve adet alternatifleri; public ekranda alternatif seçip onaylama. Server action sınırlarında aynı servis kontrollerini kullan.
- [x] 4. Tarayıcıda müşteri → parça kaydet → tekrar teklif → fark → alternatif seçimi → sipariş akışını çalıştır; mobil/koyu görünümü kontrol et. Tip/lint/build, gerçek PostgreSQL ve eski veri migration korumasını doğrula.
- [x] 5. Kapsam/sınırlama ve test belgelerini güncelle, diff'i incele. (Graphify kaldırıldığı için grafik yenilenmedi.)

## İnceleme odağı

Yeni seçeneklerin iç maliyeti herkese açık veriye sızmamalı. Gönderilen seçenek güncel sac fiyatıyla değişmemeli. Yabancı müşteri/kalem/parça/seçenek kimliği reddedilmeli. Aynı revizyonun üzerine yazma ve eski dosyayı silerek kütüphaneyi bozma engellenmeli. Eşzamanlı kabul yalnız bir sipariş ve tek tutarlı miktar seti üretmeli.
