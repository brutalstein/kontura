import type { Metadata } from "next";
import { notFound } from "next/navigation";

/**
 * Legal texts. They describe what the software actually does with data, but they are TEMPLATES:
 * the operating company must fill in its identity (env vars below) and have a lawyer review them before launch.
 */
const entity = () => process.env.LEGAL_ENTITY_NAME || "[Şirket unvanı henüz tanımlanmadı]";
const address = () => process.env.LEGAL_ENTITY_ADDRESS || "[Adres henüz tanımlanmadı]";
const contact = () => process.env.SUPPORT_EMAIL || "[İletişim e-postası henüz tanımlanmadı]";

type Doc = { title: string; sections: [string, string[]][] };

const DOCS: Record<string, () => Doc> = {
  kosullar: () => ({
    title: "Kullanım koşulları",
    sections: [
      ["1. Taraflar ve konu", [`Bu koşullar, Kontura yazılımını işleten ${entity()} (“Kontura”) ile hizmete kayıt olan işletme (“Müşteri”) arasındadır. Kontura, sac kesim atölyelerinin DXF çizimlerinden fiyat teklifi hazırlamasını sağlayan, internet üzerinden sunulan bir yazılım hizmetidir.`]],
      ["2. Hesap ve ekip", ["Müşteri, hesabını oluşturan kişinin işletme adına işlem yapmaya yetkili olduğunu kabul eder. Hesap sahibi, ekibine davet ettiği kullanıcıların işlemlerinden sorumludur. Şifrelerin gizliliği kullanıcının sorumluluğundadır."]],
      ["3. Deneme ve ücretlendirme", ["Yeni hesaplar 14 gün boyunca ücretsiz denenir. Deneme sonunda hizmeti kullanmaya devam etmek için ücretli bir plan seçilmelidir. Plan ücretleri fiyat sayfasında ilan edilir, aylık olarak peşin tahsil edilir ve KDV hariçtir. Abonelik, iptal edilene kadar her ay yenilenir.", "Müşteri aboneliğini dilediği zaman panelden iptal edebilir. İptal, içinde bulunulan ödeme döneminin sonunda geçerli olur; kullanılmayan süre için iade yapılmaz."]],
      ["4. Hesaplamaların niteliği", ["Kontura'nın ürettiği kesim süresi, malzeme tüketimi ve fiyat değerleri; Müşteri'nin girdiği makine, malzeme ve fiyatlandırma verilerine dayanan tahminlerdir. Müşteri'ye hazır sunulan kesim tabloları yalnızca örnek başlangıç değerleridir. Teklifin doğruluğunu göndermeden önce kontrol etmek ve kendi müşterisine verdiği fiyattan doğan sonuçlar Müşteri'nin sorumluluğundadır."]],
      ["5. Müşteri verileri", ["Müşteri'nin yüklediği çizimler, müşteri kayıtları ve teklifler Müşteri'ye aittir. Kontura bu verileri yalnızca hizmeti sunmak için işler. Müşteri verilerini dilediği zaman dışa aktarabilir ve hesabını tüm verileriyle birlikte kalıcı olarak silebilir."]],
      ["6. Kabul edilebilir kullanım", ["Hizmet; hukuka aykırı içerik yüklemek, başkalarının hesaplarına izinsiz erişmeye çalışmak, hizmetin işleyişini bozmak veya otomatik araçlarla aşırı yük oluşturmak amacıyla kullanılamaz."]],
      ["7. Sorumluluğun sınırı", ["Kontura hizmeti kesintisiz ve hatasız sunmak için makul özeni gösterir, ancak bunu garanti etmez. Kontura'nın bu sözleşmeden doğan toplam sorumluluğu, zararın doğduğu tarihten önceki on iki ayda Müşteri'nin ödediği ücretlerle sınırlıdır. Kâr kaybı gibi dolaylı zararlardan sorumluluk kabul edilmez."]],
      ["8. Değişiklik ve fesih", ["Kontura bu koşulları güncelleyebilir; önemli değişiklikler yürürlükten en az 15 gün önce e-postayla bildirilir. Koşulların ağır ihlali hâlinde Kontura hesabı askıya alabilir veya sözleşmeyi feshedebilir."]],
      ["9. Uygulanacak hukuk", ["Bu koşullar Türkiye Cumhuriyeti hukukuna tabidir."]],
    ],
  }),
  gizlilik: () => ({
    title: "Gizlilik ve çerez politikası",
    sections: [
      ["Hangi verileri topluyoruz", ["Hesap bilgileri: ad soyad, e-posta adresi ve şifrenizin geri döndürülemez özeti.", "İşletme bilgileri: firma adı, vergi ve iletişim bilgileri, makine, malzeme ve fiyatlandırma ayarları.", "İçerik: yüklediğiniz DXF çizimleri, teklifler, siparişler, müşteri kayıtlarınız ve destek mesajlarınız.", "İşlem kayıtları: hesabınızda yapılan önemli işlemlerin (teklif gönderme, ayar değişikliği gibi) tarihi ve yapan kullanıcı."]],
      ["Verileri ne için kullanıyoruz", ["Yalnızca hizmeti sunmak, hesabınızı güvende tutmak, size destek vermek ve yasal yükümlülükleri yerine getirmek için. Verilerinizi reklam amacıyla kullanmayız ve üçüncü kişilere satmayız."]],
      ["Çerezler", ["Kontura yalnızca iki çerez kullanır: oturumunuzu açık tutan zorunlu oturum çerezi (kontura_session, 30 gün) ve açık/koyu tema tercihinizi hatırlayan çerez (theme, 1 yıl). Reklam, analitik veya izleme çerezi kullanılmaz; bu nedenle çerez onay penceresi gösterilmez."]],
      ["Kimlerle paylaşıyoruz", ["Hizmetin çalışması için gerekli altyapı sağlayıcıları: sunucu barındırma, e-posta gönderimi ve ücretli planlarda ödeme kuruluşu. Kart bilgileriniz doğrudan ödeme kuruluşunun sayfasında alınır; Kontura sunucularına ulaşmaz."]],
      ["Saklama ve silme", ["Verileriniz hesabınız açık olduğu sürece saklanır. Hesabınızı panelden sildiğinizde firmanıza ait tüm kayıtlar kalıcı olarak silinir. Yedeklerde kalan kopyalar yedekleme döngüsü içinde silinir."]],
      ["İletişim", [`Sorularınız için: ${contact()}`]],
    ],
  }),
  kvkk: () => ({
    title: "KVKK aydınlatma metni",
    sections: [
      ["Veri sorumlusu", [`6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) uyarınca veri sorumlusu ${entity()}, ${address()}.`, "Kontura kullanıcısı işletmelerin kendi müşterilerine ait olarak sisteme girdiği kişisel veriler (ör. müşteri iletişim bilgileri, portal üzerinden gelen talepler) bakımından ilgili işletme veri sorumlusu, Kontura veri işleyendir."]],
      ["İşlenen kişisel veriler", ["Kimlik ve iletişim: ad soyad, e-posta, telefon.", "Müşteri işlem: firma bilgileri, teklif ve sipariş kayıtları, yüklenen çizimler, destek mesajları.", "İşlem güvenliği: oturum kayıtları, şifre özeti, işlem kayıtları."]],
      ["İşleme amaçları ve hukuki sebepler", ["Hizmet sözleşmesinin kurulması ve ifası (KVKK m. 5/2-c): hesabın oluşturulması, tekliflerin hazırlanması, destek verilmesi.", "Hukuki yükümlülüklerin yerine getirilmesi (m. 5/2-ç): faturalama ve yasal saklama.", "Meşru menfaat (m. 5/2-f): hizmetin güvenliği, kötüye kullanımın önlenmesi."]],
      ["Aktarım", ["Kişisel veriler; barındırma, e-posta ve ödeme hizmeti sağlayıcılarına, hizmetin sunulması amacıyla ve KVKK m. 8 ve m. 9'a uygun olarak aktarılabilir. Yurt dışına aktarım yapılması hâlinde KVKK m. 9'da öngörülen güvenceler sağlanır."]],
      ["Toplama yöntemi", ["Verileriniz; kayıt ve giriş formları, panelde yaptığınız işlemler, yüklediğiniz dosyalar ve müşteri portalı formları aracılığıyla elektronik ortamda toplanır."]],
      ["Haklarınız", ["KVKK m. 11 uyarınca; verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini veya silinmesini isteme, işlemeye itiraz etme ve zararın giderilmesini talep etme haklarına sahipsiniz.", `Başvurularınızı ${contact()} adresine iletebilirsiniz. Başvurular en geç 30 gün içinde yanıtlanır.`]],
    ],
  }),
};

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const doc = DOCS[(await params).doc];
  return { title: doc ? doc().title : "Bulunamadı" };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const make = DOCS[(await params).doc];
  if (!make) notFound();
  const doc = make();
  return (
    <article className="mx-auto max-w-[46rem] px-4 py-14 sm:px-8">
      <h1 className="text-[2.6rem]">{doc.title}</h1>
      {!process.env.LEGAL_ENTITY_NAME && (
        <p role="note" className="note note-warn mt-5">Bu metin bir şablondur. Hizmeti işleten şirketin unvanı ve iletişim bilgileri henüz tanımlanmamıştır; yayına alınmadan önce hukuki incelemeden geçmelidir.</p>
      )}
      {doc.sections.map(([heading, paras]) => (
        <section key={heading} className="mt-8">
          <h2 className="text-[1.45rem]">{heading}</h2>
          {paras.map((p) => <p key={p} className="mt-3 text-ink-2">{p}</p>)}
        </section>
      ))}
    </article>
  );
}
