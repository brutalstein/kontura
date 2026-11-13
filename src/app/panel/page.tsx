import Link from "next/link";
import { redirect } from "next/navigation";
import { createQuoteAction } from "@/app/actions";
import { can } from "@/server/core";
import { dashboard, listQuotes } from "@/server/quotes";
import { requireCtx } from "@/server/session";
import { Empty, PageHead } from "@/ui/bits";
import { ActionForm, Submit } from "@/ui/Form";
import { QUOTE_STATUS, day, num, tl } from "@/ui/format";

export const metadata = { title: "Genel bakış" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ kurulum?: string }> }) {
  const { ctx, info } = await requireCtx();
  if (!info.org.onboardedAt && can(info.role, "settings")) redirect("/panel/kurulum");
  const [d, recent, { kurulum }] = await Promise.all([dashboard(ctx), listQuotes(ctx), searchParams]);
  const limit = d.ent.quotesPerMonth;
  const stats: [string, string, string?][] = [
    ["Verilen teklif", tl(d.quotedNet), "KDV hariç"],
    ["Onaylanan", tl(d.acceptedNet), "KDV hariç"],
    ["Kazanma oranı", d.winRate === null ? "Henüz yok" : `%${num(d.winRate * 100)}`, "sonuçlanan teklifler"],
    ["Yanıt bekleyen", String(d.waiting), "teklif"],
    ["Portaldan gelen", String(d.fromPortal), "talep"],
    ["Bu ay", Number.isFinite(limit) ? `${d.usedThisMonth} / ${limit}` : String(d.usedThisMonth), Number.isFinite(limit) ? "teklif hakkı" : "teklif, sınırsız"],
  ];
  return (
    <>
      <PageHead title="Genel bakış" sub="Son 30 günün özeti.">
        {can(info.role, "write") && <ActionForm action={createQuoteAction}><Submit>Yeni teklif</Submit></ActionForm>}
      </PageHead>

      {kurulum === "tamam" && (
        <p role="status" className="note note-ok mb-6">
          Kurulum tamam. İlk teklifinizi kendi çiziminizle oluşturun ya da denemek için <a className="link" href="/ornek.dxf" download>örnek DXF dosyasını indirin</a>.
        </p>
      )}

      <dl className="panel grid grid-cols-2 lg:grid-cols-3">
        {stats.map(([label, value, unit]) => (
          <div key={label} className="border-b border-r border-line p-4 sm:p-5">
            <dt className="text-[0.82rem] text-ink-3">{label}</dt>
            <dd className="num mt-1.5 text-[1.45rem] font-semibold leading-tight">{value}</dd>
            {unit && <dd className="text-[0.78rem] text-ink-3">{unit}</dd>}
          </div>
        ))}
      </dl>

      <section className="mt-9" aria-labelledby="son-teklifler">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="son-teklifler" className="text-[1.4rem]">Son teklifler</h2>
          <Link className="link text-[0.9rem]" href="/panel/teklifler">Tümü</Link>
        </div>
        {recent.length ? (
          <div className="panel overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>No</th><th>Müşteri</th><th>Durum</th><th>Tarih</th><th className="text-right">Tutar (KDV dahil)</th></tr></thead>
              <tbody>
                {recent.slice(0, 6).map((q) => (
                  <tr key={q.id}>
                    <td><Link className="link num" href={`/panel/teklifler/${q.id}`}>#{q.number}</Link></td>
                    <td>{q.customerName ?? q.contact?.company ?? q.contact?.name ?? <span className="text-ink-3">Müşteri seçilmedi</span>}</td>
                    <td><span className={QUOTE_STATUS[q.status].cls}>{QUOTE_STATUS[q.status].label}</span></td>
                    <td className="text-ink-2">{day(q.createdAt)}</td>
                    <td className="num text-right">{q.totals?.ok ? tl(q.totals.gross) : <span className="text-ink-3">Hesaplanmadı</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Henüz teklif yok">
            <p>Yeni teklif açın, DXF dosyasını yükleyin; kesim boyu, delme sayısı ve fiyat saniyeler içinde hesaplanır. Denemek için <a className="link" href="/ornek.dxf" download>örnek DXF</a> kullanabilirsiniz.</p>
          </Empty>
        )}
      </section>
    </>
  );
}
