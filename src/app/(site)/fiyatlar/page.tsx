import Link from "next/link";
import { PLANS, TRIAL_DAYS } from "@/server/core";
import { num } from "@/ui/format";

export const metadata = { title: "Fiyatlar", description: "Kontura planları: Başlangıç, Atölye ve Pro. 14 gün ücretsiz deneme, kart bilgisi gerekmez." };

const ROWS: [string, (id: "starter" | "workshop" | "pro") => string][] = [
  ["Aylık teklif", (id) => (Number.isFinite(PLANS[id].quotesPerMonth) ? String(PLANS[id].quotesPerMonth) : "Sınırsız")],
  ["Kullanıcı", (id) => String(PLANS[id].seats)],
  ["Müşteri portalı", (id) => (PLANS[id].portal ? "Var" : "Yok")],
  ["DXF analizi ve plaka yerleşimi", () => "Var"],
  ["Müşteri onay bağlantısı, sipariş takibi", () => "Var"],
  ["Veri dışa aktarma", () => "Var"],
];
const IDS = ["starter", "workshop", "pro"] as const;

const FAQ: [string, string][] = [
  ["Deneme için kart gerekiyor mu?", `Hayır. ${TRIAL_DAYS} gün boyunca tüm özellikler açıktır ve ödeme bilgisi istenmez.`],
  ["Fiyatlara KDV dahil mi?", "Hayır, fiyatlar aylıktır ve KDV hariçtir."],
  ["İstediğim zaman iptal edebilir miyim?", "Evet. Aboneliği panelden tek adımda iptal edersiniz; ödediğiniz dönemin sonuna kadar kullanmaya devam edersiniz. Taahhüt yoktur."],
  ["Plan değiştirebilir miyim?", "Evet. Planınızı panelin Abonelik ekranından değiştirirsiniz."],
  ["Teklif sınırına takılırsam ne olur?", "Başlangıç planında ay içinde 40 teklif açabilirsiniz. Sınıra ulaşınca yeni teklif açılamaz; mevcut teklifleriniz çalışmaya devam eder. Atölye planına geçerek sınırı kaldırabilirsiniz."],
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-14 sm:px-8 lg:py-20">
      <h1 className="text-[2.7rem] sm:text-[3.4rem]">Atölyenizin büyüklüğüne göre plan</h1>
      <p className="mt-4 max-w-[58ch] text-[1.05rem] text-ink-2">Hepsinde {TRIAL_DAYS} gün ücretsiz deneme var. Kart bilgisi istenmez, taahhüt yoktur.</p>

      <div className="mt-10 grid gap-4 md:grid-cols-[1fr_1.15fr_1fr] md:items-end">
        {IDS.map((id) => {
          const p = PLANS[id], main = id === "workshop";
          return (
            <section key={id} aria-label={`${p.name} planı`} className={`panel flex flex-col p-6 ${main ? "border-2 border-accent md:pb-10 md:pt-8" : ""}`}>
              <h2 className="text-[1.7rem]">{p.name}</h2>
              <p className="mt-1 text-ink-2">{p.tagline}</p>
              <p className="mt-6 font-display text-[2.7rem] font-semibold leading-none tabular-nums">₺{num(p.priceTry)}</p>
              <p className="mt-1 text-[0.86rem] text-ink-3">aylık, KDV hariç</p>
              <Link href="/kayit" className={`btn mt-6 ${main ? "btn-primary" : "btn-secondary"}`}>Ücretsiz deneyin</Link>
            </section>
          );
        })}
      </div>

      <div className="panel mt-10 overflow-x-auto">
        <table className="tbl">
          <caption className="sr-only">Plan karşılaştırması</caption>
          <thead><tr><th scope="col">Özellik</th>{IDS.map((id) => <th key={id} scope="col">{PLANS[id].name}</th>)}</tr></thead>
          <tbody>{ROWS.map(([label, cell]) => <tr key={label}><th scope="row" className="whitespace-normal font-normal text-ink-2">{label}</th>{IDS.map((id) => <td key={id}>{cell(id)}</td>)}</tr>)}</tbody>
        </table>
      </div>

      <section className="mx-auto mt-16 max-w-[52rem]">
        <h2 className="text-[2rem]">Ödeme ve abonelik</h2>
        <div className="mt-5 border-t border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group border-b border-line py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[1.05rem] font-semibold">{q}<span aria-hidden className="text-[1.3rem] font-normal text-ink-3 transition-transform group-open:rotate-45">+</span></summary>
              <p className="mt-3 max-w-[65ch] text-ink-2">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
