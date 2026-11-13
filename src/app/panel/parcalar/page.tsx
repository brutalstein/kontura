import Link from "next/link";
import { quoteFromPartAction } from "@/app/actions";
import { can } from "@/server/core";
import { listPartRevisions } from "@/server/parts";
import { listCustomers } from "@/server/quotes";
import { requireCtx } from "@/server/session";
import { PageHead, PartPreview } from "@/ui/bits";
import { ActionForm, Submit } from "@/ui/Form";
import { day, num, tl } from "@/ui/format";

export const metadata = { title: "Parça hafızası" };

export default async function PartsPage({ searchParams }: { searchParams: Promise<{ q?: string; customerId?: string }> }) {
  const { ctx, info } = await requireCtx();
  const filter = await searchParams;
  const [parts, customers] = await Promise.all([listPartRevisions(ctx, filter), listCustomers(ctx)]);
  return (
    <>
      <PageHead title="Parça hafızası" sub="Müşteri, parça kodu ve revizyonla bulun. Tekrar teklifte güncel fiyatı ilk kaydın maliyetleriyle karşılaştırın." />
      <form className="mb-5 flex flex-wrap items-end gap-3" role="search">
        <label className="min-w-0 flex-1"><span className="label">Parça kodu, ad veya revizyon</span><input name="q" defaultValue={filter.q} className="input" placeholder="BR-001 veya revizyon A" /></label>
        <label><span className="label">Müşteri</span><select name="customerId" defaultValue={filter.customerId ?? ""} className="input"><option value="">Tüm müşteriler</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <button className="btn btn-secondary">Ara</button>
      </form>
      {parts.length ? <div className="grid gap-4 lg:grid-cols-2">{parts.map((p) => <article key={p.id} className="panel grid gap-4 p-4 sm:grid-cols-[8rem_minmax(0,1fr)] sm:p-5">
        <div className="sheet grid aspect-square place-items-center border border-line p-2"><PartPreview preview={p.analysis.preview} label={`${p.code} önizlemesi`} /></div>
        <div className="min-w-0"><p className="text-[0.82rem] text-ink-2">{p.customerName}</p>
          <h2 className="mt-1 text-[1.5rem]">{p.code} <span className="badge align-middle">Rev. {p.revision}</span></h2>
          <p className="mt-1 break-words text-[0.9rem]">{p.name}</p>
          <p className="num mt-2 text-[0.82rem] text-ink-2">{num(p.analysis.width, 1)} × {num(p.analysis.height, 1)} mm</p>
          <p className="mt-2 text-[0.84rem] text-ink-2">İlk kayıt: {day(p.baseline.savedAt)}, {num(p.baseline.qty)} adet, birim <span className="num">{tl(p.baseline.result.unitPrice)}</span> + KDV</p>
          {can(info.role, "write") && <ActionForm action={quoteFromPartAction.bind(null, p.id)} className="mt-3"><Submit className="btn btn-secondary btn-sm">Güncel fiyatla yeni teklif</Submit></ActionForm>}
        </div>
      </article>)}</div> : <div className="panel px-5 py-10"><h2 className="text-[1.5rem]">Kayıtlı revizyon bulunamadı</h2><p className="mt-2 text-ink-2">Teklifte müşteri, parça kodu ve revizyon seçip fiyatlanan kalemi parça hafızasına kaydedin.</p><Link className="link mt-4 inline-block" href="/panel/teklifler">Tekliflere git</Link></div>}
      <p className="hint mt-5">Aramanıza uyan son 100 revizyon gösterilir. Kayıtlı çizim ve ilk fiyat değişmez. Tekrar teklifte güncel malzeme, makine ve fiyat kuralları uygulanır.</p>
    </>
  );
}
