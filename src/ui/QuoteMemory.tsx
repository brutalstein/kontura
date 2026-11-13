import Link from "next/link";
import { addSavedPartAction, saveQuantityOptionsAction } from "@/app/actions";
import { compareUnitCosts } from "@/engine/comparison";
import type { LineResult } from "@/engine";
import type { PartBaseline, QuantityOption } from "@/server/schema";
import type { listPartRevisions } from "@/server/parts";
import { ActionForm, Submit } from "./Form";
import { day, num, tl } from "./format";

export function CostComparison({ baseline, result, qty }: { baseline: PartBaseline; result: LineResult; qty: number }) {
  const comparison = compareUnitCosts(baseline, result, qty);
  return (
    <details className="mt-4 rounded-[3px] border border-line-strong p-3 text-[0.86rem]">
      <summary className="cursor-pointer font-semibold">Fiyat neden değişti? <span className="num ml-1">{comparison.delta > 0 ? "+" : ""}{tl(comparison.delta)} / adet</span></summary>
      <p className="mt-3 text-ink-2">Önceki kayıt: #{baseline.quoteNumber}, {day(baseline.savedAt)}, {num(baseline.qty)} adet. Şimdi {num(qty)} adet. İlk kaydın fiyatı korunur; bu teklif güncel tarife ve adede göre hesaplanır.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="tbl"><caption className="sr-only">Birim fiyat bileşenlerinin karşılaştırması</caption>
          <thead><tr><th>Birim katkı</th><th>Önceki</th><th>Şimdi</th><th>Fark</th></tr></thead>
          <tbody>{comparison.rows.map((r) => <tr key={r.key}><td>{r.label}</td><td className="num">{tl(r.before)}</td><td className="num">{tl(r.after)}</td><td className="num">{r.delta > 0 ? "+" : ""}{tl(r.delta)}</td></tr>)}</tbody>
          <tfoot><tr className="font-semibold"><td>Birim fiyat</td><td className="num">{tl(comparison.before)}</td><td className="num">{tl(comparison.after)}</td><td className="num">{tl(comparison.delta)}</td></tr></tfoot>
        </table>
      </div>
      <p className="hint mt-3">Farklar maliyet katkılarını gösterir; adet, yerleşim, tarife ve indirim birlikte etkiler. Teklif minimum iş farkı ve KDV bu birim karşılaştırmasına dahil değildir. Kuruş yuvarlaması olabilir. Yalnızca ekibiniz görür.</p>
    </details>
  );
}

export function SavedPartPicker({ quoteId, customerId, parts }: { quoteId: string; customerId: string | null; parts: Awaited<ReturnType<typeof listPartRevisions>> }) {
  return (
    <section className="panel p-4 sm:p-5">
      <h2 className="text-[1.3rem]">Müşterinin parça hafızası</h2>
      {!customerId ? <p className="mt-2 text-[0.9rem] text-ink-2">Önce müşteri seçin. Kayıtlı revizyonları ve geçmiş fiyatı bu müşteriye göre getiririz.</p> : parts.length ? (
        <ActionForm action={addSavedPartAction.bind(null, quoteId)} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1"><span className="label">Kayıtlı revizyon</span><select name="partId" className="input" required>{parts.map((p) => <option key={p.id} value={p.id}>{p.code} / {p.revision} — {p.name}</option>)}</select></label>
          <Submit className="btn btn-secondary">Kayıtlı parçayı ekle</Submit>
        </ActionForm>
      ) : <p className="mt-2 text-[0.9rem] text-ink-2">Bu müşterinin henüz kayıtlı parçası yok. Fiyatladığınız kaleme parça kodu ve revizyon girip hafızaya kaydedin.</p>}
      <Link className="link mt-3 inline-block text-[0.84rem]" href="/panel/parcalar">Tüm parça hafızası</Link>
    </section>
  );
}

export function QuantityOptionsEditor({ quoteId, items, options, editable }: { quoteId: string; items: { id: string; name: string; qty: number }[]; options: QuantityOption[]; editable: boolean }) {
  if (!items.length) return null;
  return (
    <section className="panel p-4 sm:p-5">
      <h2 className="text-[1.4rem]">Adet seçenekleri</h2>
      <p className="mt-2 text-[0.9rem] text-ink-2">Müşteriniz aynı tekliften bir adet seçeneğini onaylayabilir. Her seçenek bütün teklif olarak hesaplanır; plaka paylaşımı, hazırlık ve minimum iş farkı korunur.</p>
      {options.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-3">{options.map((o) => <div key={o.id} className="rounded-[3px] border border-line p-3">
        <h3 className="font-sans text-[0.95rem] font-semibold">{o.label}</h3>
        <ul className="mt-2 text-[0.84rem] text-ink-2">{items.map((it) => <li key={it.id}>{it.name}: <span className="num">{num(o.quantities[it.id])}</span> adet</li>)}</ul>
        <p className="num mt-3 font-semibold">{o.totals.ok ? tl(o.totals.gross) : "Hesaplanamadı"}</p><p className="hint">KDV dahil</p>
      </div>)}</div>}
      {editable && <details className="mt-4 border-t border-line pt-3"><summary className="cursor-pointer text-[0.9rem] font-semibold">Adet seçeneklerini düzenle</summary>
        <ActionForm action={saveQuantityOptionsAction.bind(null, quoteId)} className="mt-4 grid gap-4">
          {[0, 1, 2].map((i) => <fieldset key={i} className="grid gap-3 rounded-[3px] border border-line p-3 sm:grid-cols-2">
            <legend className="px-1 text-[0.84rem] text-ink-2">{i + 1}. alternatif</legend>
            <label className="sm:col-span-2"><span className="label">{i + 1}. alternatif adı</span><input name={`label_${i}`} defaultValue={options[i]?.label ?? ""} maxLength={60} placeholder="Örn. 100 adet / seri üretim" className="input input-sm" /></label>
            {items.map((it) => <label key={it.id}><span className="label">{it.name} — {i + 1}. alternatif adedi</span><input name={`qty_${i}_${it.id}`} type="number" min={1} max={100000} defaultValue={options[i]?.quantities[it.id] ?? it.qty} className="input input-sm num" /></label>)}
          </fieldset>)}
          <p className="hint">Adını boş bıraktığınız alternatif kaydedilmez. Kalem eklendiğinde veya kaldırıldığında seçenekler temizlenir; yeniden hazırlayın. Gönderilmiş fiyatlar değişmez.</p>
          <div><Submit className="btn btn-secondary">Seçenekleri hesapla</Submit></div>
        </ActionForm>
      </details>}
    </section>
  );
}
