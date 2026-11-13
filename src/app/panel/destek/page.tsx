import { supportAction } from "@/app/actions";
import { Field, PageHead } from "@/ui/bits";
import { ActionForm, Submit } from "@/ui/Form";

export const metadata = { title: "Destek" };

const FAQ: [string, string][] = [
  ["DWG dosyam var, nasıl yüklerim?", "Kontura DXF okur. AutoCAD, SolidWorks veya benzeri programda çizimi “Farklı kaydet › DXF” ile kaydedin. Parça 1:1 ölçekte ve milimetre biriminde olmalıdır."],
  ["Fiyat neden beklediğimden farklı çıktı?", "Fiyat; makinenizin dakika ücreti, kesim tablosundaki hız ve delme süresi, malzeme kilogram fiyatı ve kâr oranından hesaplanır. Ayarlar › Makineler bölümündeki kesim tablosunun kendi makinenizle uyuştuğunu kontrol edin. Her kalemdeki maliyet dökümü hangi kalemin fiyatı belirlediğini gösterir."],
  ["“Açık kontur” uyarısı ne demek?", "Çizimde ucu kapanmayan bir çizgi var. Lazer bu yolu keser ama parça düşmeyebilir. Çizimi CAD programında kapatıp yeniden yükleyin ya da çizgi bilerek açıksa uyarıyı dikkate almayın."],
  ["Büküm çizgileri nasıl tanınır?", "Katman adında BÜKÜM, BEND, FOLD veya ABKANT geçen çizgiler büküm sayılır; kesim boyuna eklenmez. Büküm sayısını her kalemde elle de değiştirebilirsiniz."],
  ["Kalınlık tabloda yoksa ne olur?", "Tablodaki iki kalınlık arasındaki değerler aradeğerle hesaplanır. Tablonun dışında kalan kalınlıklar için fiyat verilmez; önce o kalınlığı kesim tablosuna ekleyin."],
  ["Müşterim teklifi nasıl onaylar?", "Teklifi gönderdiğinizde size özel bir bağlantı oluşur. Müşteriniz bu sayfada parçaları ve fiyatı görür, tek tuşla onaylar. Onaylanan teklif Siparişler listesine düşer."],
];

export default function SupportPage() {
  const mail = process.env.SUPPORT_EMAIL;
  return (
    <>
      <PageHead title="Destek" sub="Sık sorulanlara göz atın ya da bize yazın. Mesajınız hesabınızla birlikte kaydedilir." />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-labelledby="sss">
          <h2 id="sss" className="mb-3 text-[1.4rem]">Sık sorulanlar</h2>
          <div className="panel divide-y divide-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-5 py-3.5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">{q}<span aria-hidden className="text-ink-3 group-open:rotate-45">+</span></summary>
                <p className="mt-2 max-w-[65ch] text-ink-2">{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="panel p-5" aria-labelledby="yaz">
          <h2 id="yaz" className="text-[1.3rem]">Bize yazın</h2>
          <ActionForm action={supportAction} resetOnOk className="mt-4 grid gap-3">
            <Field label="Konu" name="subject" required minLength={3} maxLength={160} />
            <label><span className="label">Mesajınız</span><textarea name="body" required minLength={10} maxLength={5000} rows={6} className="input" placeholder="Sorunu, hangi teklifte ve hangi dosyada gördüğünüzü yazın." /></label>
            <div><Submit>Gönder</Submit></div>
          </ActionForm>
          {mail && <p className="hint mt-4">Doğrudan e-posta: <a className="link" href={`mailto:${mail}`}>{mail}</a></p>}
        </section>
      </div>
    </>
  );
}
