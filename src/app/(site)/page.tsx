import Link from "next/link";
import { NestPreview, PartPreview } from "@/ui/bits";
import { num, tl } from "@/ui/format";
import { EXAMPLE, SAMPLE, SAMPLE_QUOTE } from "@/ui/sample";

const STEPS: [string, string][] = [
  ["DXF'i yükleyin", "Müşterinizin gönderdiği çizimi sürükleyin. Kontura konturları birleştirir; kesim boyunu, delme sayısını ve parça ölçüsünü çıkarır."],
  ["Malzeme ve adedi seçin", "Kalınlığı ve adedi girin. Parçalar plakaya yerleştirilir; makine süresi ve sac maliyeti kendi rakamlarınızla hesaplanır."],
  ["Teklifi gönderin", "Müşteriniz bağlantıdan parçaları ve fiyatı görür, tek tuşla onaylar. Onaylanan teklif sipariş listenize düşer."],
];

const FAQ: [string, string][] = [
  ["Hangi dosyaları okur?", "ASCII DXF dosyalarını okur: çizgi, yay, daire, polyline, elips, spline ve blok. DWG ve STEP dosyalarını CAD programınızda DXF olarak kaydetmeniz gerekir."],
  ["Fiyatı neye göre hesaplıyor?", "Sizin girdiğiniz rakamlara göre: makinenizin dakika ücreti, kalınlığa göre kesim hızı ve delme süresi, malzemenin kilogram fiyatı, kâr oranınız. Hazır gelen kesim tablosu yalnızca başlangıç içindir, kendi makinenize göre düzeltirsiniz."],
  ["Yerleşim (nesting) gerçek şekle göre mi?", "Hayır. Parçalar sınır dikdörtgenlerine göre, 90 derece döndürülerek yerleştirilir. Bu, sac tüketimini teklif için güvenli tarafta tahmin eder; üretimdeki CAM yerleşiminiz genelde daha sıkı olur."],
  ["Makineme program (G kodu) üretir mi?", "Hayır. Kontura bir teklif ve sipariş takip aracıdır; CAM yazılımınızın yerini almaz."],
  ["Deneme bitince verilerim ne olur?", "Silinmez. Plan seçene kadar yeni teklif açamaz ve düzenleme yapamazsınız, mevcut kayıtlarınızı görmeye devam edersiniz. İstediğiniz an tüm verinizi indirebilir veya kalıcı olarak silebilirsiniz."],
];

export default function LandingPage() {
  const line = SAMPLE_QUOTE.lines[0], stock = SAMPLE_QUOTE.stocks[0];
  const breakdown: [string, number][] = [["Makine süresi", line.machineCost], ["Malzeme", line.materialCost], ["Büküm", line.bendCost], ["Kâr", line.marginAmount]];
  return (
    <>
      {/* Hero: asymmetric split. The drawing on the right is the engine's own reading of the sample DXF. */}
      <section className="mx-auto grid max-w-[1240px] items-center gap-10 px-4 pb-16 pt-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:pb-24 lg:pt-20">
        <div>
          <h1 className="text-[2.7rem] sm:text-[3.6rem] lg:text-[4.1rem]">DXF&apos;i yükleyin, teklif dakikalar içinde hazır.</h1>
          <p className="mt-5 max-w-[52ch] text-[1.1rem] text-ink-2">Kontura çizimden kesim boyunu, delme sayısını ve plaka yerleşimini okur; fiyatı makinenizin gerçek maliyetiyle hesaplar.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/kayit" className="btn btn-primary">Ücretsiz deneyin</Link>
            <Link href="#nasil" className="btn btn-secondary">Nasıl çalışır</Link>
          </div>
        </div>
        <figure className="panel sheet trace p-5 sm:p-8">
          <PartPreview preview={SAMPLE.preview} className="mx-auto max-h-[44dvh] w-full" label="Örnek braketin DXF'ten okunan konturları" />
          <figcaption className="mt-6 grid grid-cols-3 gap-4 border-t border-line-strong pt-5">
            {[["Kesim boyu", `${num(SAMPLE.cutLength)} mm`], ["Delme", String(SAMPLE.pierceCount)], ["Ölçü", `${num(SAMPLE.width)} × ${num(SAMPLE.height)}`]].map(([k, v]) => (
              <div key={k}><span className="block text-[0.78rem] text-ink-3">{k}</span><span className="num mt-0.5 block text-[1.05rem] font-semibold sm:text-[1.2rem]">{v}</span></div>
            ))}
          </figcaption>
        </figure>
      </section>

      {/* How it works: three ruled columns */}
      <section id="nasil" className="scroll-mt-20 border-y border-line bg-surface">
        <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-8 lg:py-20">
          <h2 className="text-[2.2rem] sm:text-[2.7rem]">Çizimden teklife üç adım</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-0">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="border-t-2 border-ink pt-5 md:pr-8">
                <span className="num text-[0.9rem] text-accent-text">{i + 1}</span>
                <h3 className="mt-2 text-[1.5rem]">{title}</h3>
                <p className="mt-2 max-w-[38ch] text-ink-2">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features: asymmetric bento, five cells, three of them carry real engine output */}
      <section id="ozellikler" className="mx-auto max-w-[1240px] scroll-mt-20 px-4 py-16 sm:px-8 lg:py-24">
        <h2 className="max-w-[20ch] text-[2.2rem] sm:text-[2.7rem]">Hesap makinesi ve Excel yerine tek ekran</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-6">
          <article className="panel p-6 md:col-span-4">
            <h3 className="text-[1.5rem]">Plaka yerleşimi fiyatın içinde</h3>
            <p className="mt-2 max-w-[56ch] text-ink-2">Parçalar plakaya yerleştirilir, kaç plaka gittiği ve artan boy hesaplanır. Sac maliyeti tahminle değil, yerleşimle belirlenir.</p>
            <div className="mt-6"><NestPreview sheetW={EXAMPLE.sheetW} sheetH={EXAMPLE.sheetH} sheet={stock.nest.sheets[0]} /></div>
            <p className="num mt-3 text-[0.84rem] text-ink-2">{EXAMPLE.qty} adet örnek braket, {num(EXAMPLE.sheetW)} × {num(EXAMPLE.sheetH)} mm plaka, ücretlenen sac {num(stock.billableWeightKg, 1)} kg</p>
          </article>

          <article className="panel bg-surface-2 p-6 md:col-span-2">
            <h3 className="text-[1.5rem]">Her kuruşun nereden geldiği belli</h3>
            <dl className="mt-5 grid gap-2.5">
              {breakdown.map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-ink-2">{k}</dt><dd className="num">{tl(v)}</dd></div>)}
              <div className="flex justify-between gap-4 border-t border-line-strong pt-3 font-semibold"><dt>Birim fiyat</dt><dd className="num">{tl(line.unitPrice)}</dd></div>
            </dl>
            <p className="mt-4 text-[0.8rem] text-ink-3">Örnek hesap: {EXAMPLE.qty} adet, {EXAMPLE.thickness} mm {EXAMPLE.material}, {EXAMPLE.ratePerMin} ₺/dk makine, {EXAMPLE.pricePerKg} ₺/kg sac, %{EXAMPLE.marginPct} kâr. Sizin fiyatınız kendi rakamlarınızla çıkar.</p>
          </article>

          <article className="panel p-6 md:col-span-2">
            <h3 className="text-[1.5rem]">Çizim hatalarını kesmeden önce görün</h3>
            <ul className="mt-4 grid gap-3 text-ink-2">
              <li><strong className="text-ink">Açık kontur.</strong> Ucu kapanmayan yollar işaretlenir.</li>
              <li><strong className="text-ink">Üst üste çizgi.</strong> Çift çizilen kenarlar ayıklanır, iki kez ücretlenmez.</li>
              <li><strong className="text-ink">Küçük delik.</strong> Sac kalınlığından küçük delikler için uyarı verir.</li>
            </ul>
          </article>

          <article className="panel p-6 md:col-span-2">
            <h3 className="text-[1.5rem]">Müşteriniz kendi yüklesin</h3>
            <p className="mt-2 text-ink-2">Firmanıza özel portal adresini sitenize koyun. Müşteri DXF&apos;i yükler, malzemeyi seçer; talep taslak teklif olarak önünüze düşer. Siz onaylamadan fiyat bağlayıcı olmaz.</p>
          </article>

          <article className="panel p-6 md:col-span-2">
            <h3 className="text-[1.5rem]">Ekibiniz aynı listede</h3>
            <p className="mt-2 text-ink-2">Teklifçi fiyat verir, yönetici ayarları değiştirir, izleyici yalnızca görür. Onaylanan işler kesim, büküm ve teslim durumuyla takip edilir.</p>
          </article>
        </div>
      </section>

      {/* Honest scope: two plain columns */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-16 sm:px-8 md:grid-cols-2 lg:py-20">
          <div>
            <h2 className="text-[2rem]">Kontura ne yapar</h2>
            <ul className="mt-5 grid gap-3 text-ink-2">
              {["2B DXF çizimlerinden lazer, plazma, su jeti ve oksijen kesim teklifi", "Kalınlığa göre kesim süresi ve delme süresi hesabı", "Dikdörtgen yerleşimle plaka ve artan sac hesabı", "Büküm, ek işlem, adet indirimi, minimum sipariş, KDV", "Müşteri onay bağlantısı ve sipariş takibi"].map((t) => <li key={t} className="border-l-2 border-accent pl-3">{t}</li>)}
            </ul>
          </div>
          <div>
            <h2 className="text-[2rem]">Ne yapmaz</h2>
            <ul className="mt-5 grid gap-3 text-ink-2">
              {["Makine programı veya G kodu üretmez; CAM yazılımınız yerinde kalır", "3B model (STEP, IGES) açmaz, büküm açınımı çıkarmaz", "Gerçek şekle göre iç içe yerleşim yapmaz", "E-fatura kesmez, muhasebe programı değildir"].map((t) => <li key={t} className="border-l-2 border-line-strong pl-3">{t}</li>)}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ: single narrow column */}
      <section className="mx-auto max-w-[52rem] px-4 py-16 sm:px-8 lg:py-20">
        <h2 className="text-[2.2rem]">Sık sorulanlar</h2>
        <div className="mt-6 border-t border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group border-b border-line py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[1.05rem] font-semibold">{q}<span aria-hidden className="text-[1.3rem] font-normal text-ink-3 transition-transform group-open:rotate-45">+</span></summary>
              <p className="mt-3 max-w-[65ch] text-ink-2">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing call */}
      <section className="mx-auto max-w-[1240px] px-4 pb-20 sm:px-8">
        <div className="panel sheet flex flex-wrap items-center justify-between gap-6 border-line-strong p-8 sm:p-12">
          <div>
            <h2 className="text-[2.2rem] sm:text-[2.8rem]">İlk teklifinizi bugün verin</h2>
            <p className="mt-2 max-w-[52ch] text-ink-2">14 gün boyunca tüm özellikler açık. Kart bilgisi istenmez. Planlar aylık ₺1.900&apos;den başlar.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/kayit" className="btn btn-primary">Ücretsiz deneyin</Link>
            <Link href="/fiyatlar" className="btn btn-secondary">Fiyatları görün</Link>
          </div>
        </div>
      </section>
    </>
  );
}
