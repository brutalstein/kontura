import Link from "next/link";
import { createQuoteAction } from "@/app/actions";
import { can } from "@/server/core";
import { listQuotes } from "@/server/quotes";
import { requireCtx } from "@/server/session";
import { Empty, PageHead } from "@/ui/bits";
import { ActionForm, Submit } from "@/ui/Form";
import { QUOTE_STATUS, day, tl } from "@/ui/format";

export const metadata = { title: "Teklifler" };

const FILTERS = [["", "Tümü"], ["draft", "Taslak"], ["sent", "Gönderildi"], ["accepted", "Onaylandı"], ["rejected", "Reddedildi"]];

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ durum?: string; q?: string }> }) {
  const { ctx, info } = await requireCtx();
  const { durum = "", q = "" } = await searchParams;
  const rows = await listQuotes(ctx, { status: durum, q });
  const filtered = Boolean(durum || q);
  return (
    <>
      <PageHead title="Teklifler" sub="DXF yükleyerek hazırladığınız ve portaldan gelen tüm teklifler.">
        {can(info.role, "write") && <ActionForm action={createQuoteAction}><Submit>Yeni teklif</Submit></ActionForm>}
      </PageHead>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Duruma göre süz" className="flex flex-wrap gap-1.5">
          {FILTERS.map(([value, label]) => (
            <Link key={value} href={{ pathname: "/panel/teklifler", query: { ...(value && { durum: value }), ...(q && { q }) } }} aria-current={durum === value ? "page" : undefined}
              className={`btn btn-sm ${durum === value ? "btn-secondary border-accent" : "btn-ghost"}`}>{label}</Link>
          ))}
        </nav>
        <form role="search" className="flex gap-2">
          {durum && <input type="hidden" name="durum" value={durum} />}
          <label className="sr-only" htmlFor="q">Tekliflerde ara</label>
          <input id="q" name="q" defaultValue={q} placeholder="Müşteri adı veya teklif no" className="input input-sm w-56" />
          <button className="btn btn-secondary btn-sm">Ara</button>
        </form>
      </div>

      {rows.length ? (
        <div className="panel overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>No</th><th>Müşteri</th><th>Kalem</th><th>Durum</th><th>Tarih</th><th>Geçerlilik</th><th className="text-right">Tutar (KDV dahil)</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link className="link num" href={`/panel/teklifler/${r.id}`}>#{r.number}</Link></td>
                  <td>
                    {r.customerName ?? r.contact?.company ?? r.contact?.name ?? <span className="text-ink-3">Müşteri seçilmedi</span>}
                    {r.source === "portal" && <span className="badge ml-2">Portal</span>}
                  </td>
                  <td className="num">{r.itemCount}</td>
                  <td><span className={QUOTE_STATUS[r.status].cls}>{QUOTE_STATUS[r.status].label}</span></td>
                  <td className="text-ink-2">{day(r.createdAt)}</td>
                  <td className="text-ink-2">{day(r.validUntil)}</td>
                  <td className="num text-right">{r.totals?.ok ? tl(r.totals.gross) : <span className="text-ink-3">Hesaplanmadı</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : filtered ? (
        <Empty title="Eşleşen teklif yok"><p>Süzgeci veya arama metnini değiştirin. <Link className="link" href="/panel/teklifler">Tüm teklifleri göster</Link></p></Empty>
      ) : (
        <Empty title="İlk teklifinizi oluşturun">
          <p>Yeni teklif açın ve müşterinizin DXF dosyasını yükleyin. Elinizde çizim yoksa <a className="link" href="/ornek.dxf" download>örnek DXF</a> ile deneyin.</p>
        </Empty>
      )}
    </>
  );
}
