# Tasarım sistemi

Soğuk çelik yüzeyler, turuncu kesim izi ve teknik çizim ızgarası. Ana görseller gerçek örnek DXF ve nesting motorundan gelir. Üretilmiş fotoğraf, hayali müşteri logosu ve referans yorumu yoktur. Kontura marka tescili kontrol edilmedi.

Kaynak `src/app/globals.css`: arka plan #f3f5f7 / #0c1116, yüzey #fcfdfd / #131a21, vurgu #ff6b2c, vurgu üstü yazı #10161d. Yazı, çizgi, başarı/uyarı/hata renkleri semantik CSS değişkenleridir.

Archivo gövde, Barlow Condensed başlık, JetBrains Mono teknik değerler içindir. `next/font` fontları derlemede alır ve uygulamadan sunar. Derleme ağ erişimi gerektirebilir; tarayıcıda üçüncü taraf font isteği gerekmez.

3 piksel köşe, ince sınırlar. `.btn`, `.input`, `.panel`, `.note`, `.badge` ortak temeldir. Birincil eylem turuncu; silme tehlike rengi ve onay kullanır. ActionForm işlem durumunu/hata/başarıyı alanların yanında gösterir. İstemci doğrulaması sunucu kontrolünün yerine geçmez.

DXF önizlemesinde Y ekseni ekrana çevrilir. SVG kontur kalınlığı ekran pikseli cinsinden sabittir. Yerleşim görseli üretim kesim planı değil, teklif amaçlı sınır dikdörtgenleridir.

Türkçe belge dili, alan etiketleri, içerik atlama bağlantısı, odak stilleri, canlı durum alanları ve reduced-motion davranışı bulunur. Sistem teması varsayılandır; seçim bir yıllık tema çerezine yazılır.

375/768/1440 piksel, açık/koyu tema, genel sayfalarda taşma ve tarayıcı hataları otomatik kontrol edilir. Gerçek ekran okuyucu/WCAG denetimi yapılmadı. Ekran görüntüleri insan incelemesi içindir; piksel karşılaştırmalı referans testi yoktur.

Tailwind yalnızca `src` ağacını tarar. Üretilmiş grafik/test/dağıtım dosyalarının taranması geliştirmede sürekli yeniden yüklemeye neden olabildiğinden kapsam sınırlandırılmıştır.
