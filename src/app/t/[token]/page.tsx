import { notFound } from "next/navigation";
import { acceptQuantityOptionAction, publicDecideAction } from "@/app/actions";
import { getDb } from "@/server/db";
import { getPublicQuote } from "@/server/quotes";
import { PartPreview } from "@/ui/bits";
import { PrintButton, ThemeToggle } from "@/ui/client";
import { ActionForm, Submit } from "@/ui/Form";
import { QUOTE_STATUS, day, num, tl } from "@/ui/format";

export const metadata = { title: "Fiyat teklifi", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getPublicQuote(await getDb(), token);
  if (!data) notFound();
  const { quote, org, items, expired } = data, totals = quote.totals, c = org.company;
  const open = quote.status === "sent" && !expired;
  return (
    <main id="icerik" className="mx-auto w-full max-w-[56rem] px-4 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-ink pb-6">
        <div>
          <p className="font-display text-[1.9rem] font-bold leading-none">{org.name}</p>
          <p className="mt-2 max-w-[40ch] whitespace-pre-line text-[0.86rem] text-ink-2">
            {[c.address, c.phone, c.email, c.taxOffice && c.taxNo ? `${c.taxOffice} V.D. ${c.taxNo}` : c.taxNo].filter(Boolean).join("\n")}
          </p>
        </div>
        <div className="text-right">
          <h1 className="text-[1.9rem]">Fiyat teklifi <span className="num">#{quote.number}</span></h1>
          <p className="mt-1 text-[0.9rem] text-ink-2">Tarih {day(quote.sentAt ?? quote.createdAt)}{quote.validUntil && <><br />Geçerlilik {day(quote.validUntil)}</>}</p>
          <span className={`${QUOTE_STATUS[quote.status].cls} mt-2`}>{expired ? "Süresi doldu" : QUOTE_STATUS[quote.status].label}</span>
        </div>
      </header>

      {data.customerName && <p className="mt-6"><span className="text-[0.82rem] text-ink-3">Sayın</span><br /><strong className="text-[1.1rem]">{data.customerName}</strong></p>}

      <div className="mt-6 overflow-x-auto">
        <table className="tbl">
          <thead><tr><th><span className="sr-only">Önizleme</span></th><th>Parça</th><th>Malzeme</th><th className="text-right">Adet</th><th className="text-right">Birim fiyat</th><th className="text-right">Tutar</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td className="w-20"><div className="sheet grid size-16 place-items-center rounded-[3px] border border-line p-1"><PartPreview preview={it.preview} className="max-h-full max-w-full" weight={1} label={`${it.name} önizlemesi`} /></div></td>
                <td><strong>{it.name}</strong>{it.partCode && <span className="mt-1 block text-[0.82rem]">{it.partCode}{it.revision && ` / Rev. ${it.revision}`}</span>}<br /><span className="num text-[0.82rem] text-ink-2">{num(it.width, 1)} × {num(it.height, 1)} mm</span></td>
                <td>{it.materialName}{it.thickness && <><br /><span className="num text-[0.82rem] text-ink-2">{num(it.thickness, 2)} mm</span></>}{it.customerMaterial && <span className="mt-1 block text-[0.82rem] text-ink-2">Malzeme müşteriden, fiyata dahil değil</span>}{it.ops.length > 0 && <span className="mt-1 block text-[0.82rem] text-ink-2">Dahil işlemler: {it.ops.join(", ")}</span>}</td>
                <td className="num text-right">{it.qty}</td>
                <td className="num text-right">{it.unitPrice === null ? "" : tl(it.unitPrice)}</td>
                <td className="num text-right font-semibold">{it.lineTotal === null ? "" : tl(it.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totals?.ok && (
        <dl className="ml-auto mt-6 grid w-full max-w-[20rem] gap-2">
          {totals.minOrderAdjustment > 0 && <div className="flex justify-between gap-4"><dt className="text-ink-2">Minimum sipariş farkı</dt><dd className="num">{tl(totals.minOrderAdjustment)}</dd></div>}
          <div className="flex justify-between gap-4"><dt className="text-ink-2">Toplam (KDV hariç)</dt><dd className="num">{tl(totals.net)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-ink-2">KDV</dt><dd className="num">{tl(totals.vat)}</dd></div>
          <div className="flex justify-between gap-4 border-t-2 border-ink pt-3 text-[1.25rem] font-semibold"><dt>Genel toplam</dt><dd className="num">{tl(totals.gross)}</dd></div>
        </dl>
      )}

      {quote.options.length > 0 && <section className="mt-8 border-t border-line pt-5" aria-label="Adet alternatifleri">
        <h2 className="text-[1.5rem]">Adet alternatifleri</h2>
        <p className="mt-2 text-[0.9rem] text-ink-2">Aşağıdaki seçeneklerden birini onaylayabilirsiniz. Yalnızca seçtiğiniz miktarlar siparişe dönüşür. Üstteki teklif mevcut miktarlar içindir.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">{quote.options.map((o) => <article key={o.id} className={`panel p-4 ${quote.selectedOptionId === o.id ? "border-accent" : ""}`}>
          <h3 className="text-[1.25rem]">{o.label}</h3>
          {quote.selectedOptionId === o.id && <p className="badge badge-ok mt-2">Onayladığınız seçenek</p>}
          <ul className="mt-3 grid gap-2 text-[0.84rem] text-ink-2">{o.lines.map((l) => <li key={l.id}>{items.find((it) => it.id === l.id)?.name}: <span className="num">{num(l.qty)}</span> adet<br />Birim <span className="num">{tl(l.unitPrice)}</span> + KDV</li>)}</ul>
          {o.totals.ok && <><p className="num mt-3 text-[1.2rem] font-semibold">{tl(o.totals.gross)}</p><p className="hint">KDV dahil toplam</p></>}
          {open && o.totals.ok && <ActionForm action={acceptQuantityOptionAction.bind(null, token, o.id)} confirm={`${o.label} seçeneğini onaylıyor musunuz? Sipariş bu miktarlarla hazırlanacak.`} className="mt-4 no-print"><Submit className="btn btn-secondary btn-sm">{o.label} seçeneğini onayla</Submit></ActionForm>}
        </article>)}</div>
      </section>}

      {quote.notes && <section className="mt-8"><h2 className="text-[1.2rem]">Notlar</h2><p className="mt-2 whitespace-pre-wrap text-ink-2">{quote.notes}</p></section>}

      <section className="no-print mt-10 border-t border-line pt-6" aria-label="Teklif yanıtı">
        {open ? (
          <div className="flex flex-wrap items-start gap-3">
            <ActionForm action={publicDecideAction.bind(null, token, "accepted")} confirm="Teklifi onaylıyor musunuz? Firma siparişinizi hazırlamaya başlayacak."><Submit>Teklifi onayla</Submit></ActionForm>
            <ActionForm action={publicDecideAction.bind(null, token, "rejected")} confirm="Teklifi reddetmek istediğinize emin misiniz?"><Submit className="btn btn-secondary">Reddet</Submit></ActionForm>
          </div>
        ) : (
          <p className={`note ${quote.status === "accepted" ? "note-ok" : "note-warn"}`}>
            {quote.status === "accepted" && `Bu teklif ${day(quote.decidedAt)} tarihinde onaylandı. ${org.name} sizinle iletişime geçecek.`}
            {quote.status === "rejected" && "Bu teklif reddedildi. Yeni bir teklif için firmayla iletişime geçin."}
            {expired && "Bu teklifin geçerlilik süresi doldu. Güncel fiyat için firmayla iletişime geçin."}
          </p>
        )}
        <div className="mt-6 flex items-center justify-between gap-3">
          <PrintButton />
          <ThemeToggle />
        </div>
      </section>
      <footer className="mt-10 text-[0.8rem] text-ink-3">Bu teklif Kontura ile hazırlandı. Fiyatlar teklif tarihindeki malzeme ve işçilik maliyetlerine göre hesaplanmıştır.</footer>
    </main>
  );
}
