import Link from "next/link";
import { updateOrderAction } from "@/app/actions";
import { can } from "@/server/core";
import { ORDER_STATUSES, listOrders } from "@/server/quotes";
import { requireCtx } from "@/server/session";
import { Empty, PageHead } from "@/ui/bits";
import { ActionForm, Submit } from "@/ui/Form";
import { ORDER_STATUS, day, tl } from "@/ui/format";

export const metadata = { title: "Siparişler" };

export default async function OrdersPage() {
  const { ctx, info } = await requireCtx();
  const rows = await listOrders(ctx);
  const canWrite = can(info.role, "write");
  const open = rows.filter((r) => r.status !== "delivered"), done = rows.filter((r) => r.status === "delivered");
  if (!rows.length) {
    return (
      <>
        <PageHead title="Siparişler" />
        <Empty title="Henüz sipariş yok"><p>Müşteriniz bir teklifi onayladığında sipariş burada kendiliğinden açılır. Telefonla gelen onayları teklif ekranından işaretleyebilirsiniz.</p></Empty>
      </>
    );
  }
  return (
    <>
      <PageHead title="Siparişler" sub="Onaylanan teklifler. Durumu ve termin tarihini güncelledikçe ekip aynı listeyi görür." />
      {[["Açık siparişler", open], ["Teslim edilenler", done]].map(([title, list]) => (list as typeof rows).length > 0 && (
        <section key={title as string} className="mb-8">
          <h2 className="mb-3 text-[1.4rem]">{title as string} <span className="num text-ink-3">{(list as typeof rows).length}</span></h2>
          <ul className="grid gap-3">
            {(list as typeof rows).map((o) => (
              <li key={o.id} className="panel p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">
                    <Link className="link num" href={`/panel/teklifler/${o.quoteId}`}>#{o.number}</Link>
                    <span className="ml-3">{o.customerName ?? o.contact?.company ?? o.contact?.name ?? "Müşteri seçilmedi"}</span>
                  </p>
                  <p className="text-[0.86rem] text-ink-2">{day(o.createdAt)} · <span className="num">{o.totals?.ok ? tl(o.totals.gross) : ""}</span></p>
                </div>
                {canWrite ? (
                  <ActionForm action={updateOrderAction.bind(null, o.id)} auto className="mt-3 grid gap-3 sm:grid-cols-[12rem_11rem_minmax(0,1fr)_auto]">
                    <label><span className="label">Durum</span>
                      <select name="status" defaultValue={o.status} className="input input-sm">{ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS[s]}</option>)}</select>
                    </label>
                    <label><span className="label">Termin</span><input type="date" name="dueDate" defaultValue={o.dueDate ? o.dueDate.toISOString().slice(0, 10) : ""} className="input input-sm" /></label>
                    <label><span className="label">Üretim notu</span><input name="note" defaultValue={o.note ?? ""} maxLength={1000} className="input input-sm" /></label>
                    <div className="flex items-end"><Submit className="btn btn-secondary btn-sm">Kaydet</Submit></div>
                  </ActionForm>
                ) : (
                  <p className="mt-2 text-[0.9rem] text-ink-2"><span className="badge mr-2">{ORDER_STATUS[o.status]}</span>{o.dueDate && <>Termin {day(o.dueDate)}. </>}{o.note}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
