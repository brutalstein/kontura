import Link from "next/link";
import { notFound } from "next/navigation";
import { applyPartsListAction, bulkUpdateItemsAction, decideQuoteAction, deleteQuoteAction, removeItemAction, reopenQuoteAction, savePartAction, sendQuoteAction, updateItemAction, updateQuoteAction } from "@/app/actions";
import { listCatalog } from "@/server/catalog";
import { AppError, can, entitlements } from "@/server/core";
import { listPartRevisions } from "@/server/parts";
import { getQuote, listCustomers, publicQuoteUrl, quoteNesting } from "@/server/quotes";
import { requireCtx } from "@/server/session";
import { NestPreview, PartPreview } from "@/ui/bits";
import { CopyButton, UploadDxf } from "@/ui/client";
import { ActionForm, Submit } from "@/ui/Form";
import { OP_UNIT, QUOTE_STATUS, day, num, tl } from "@/ui/format";
import { CostComparison, QuantityOptionsEditor, SavedPartPicker } from "@/ui/QuoteMemory";

export const metadata = { title: "Teklif" };

const Row = ({ k, v, strong }: { k: string; v: string; strong?: boolean }) => (
  <div className={`flex items-baseline justify-between gap-4 ${strong ? "border-t border-line-strong pt-3 text-[1.15rem] font-semibold" : ""}`}>
    <dt className={strong ? "" : "text-ink-2"}>{k}</dt><dd className="num">{v}</dd>
  </div>
);

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx, info } = await requireCtx();
  const { id } = await params;
  const data = await getQuote(ctx, id).catch((e) => { if (e instanceof AppError && e.code === "not_found") notFound(); throw e; });
  const { quote, items, customer, order } = data;
  const [cat, customers, nesting, parts] = await Promise.all([listCatalog(ctx), listCustomers(ctx), quoteNesting(ctx, id), quote.customerId ? listPartRevisions(ctx, { customerId: quote.customerId }) : Promise.resolve([])]);
  const canWrite = can(info.role, "write") && entitlements(info.org).active;
  const editable = quote.status === "draft" && canWrite;
  const totals = quote.totals;
  const st = QUOTE_STATUS[quote.status];
  const url = publicQuoteUrl(quote.publicToken);

  return (
    <>
      <p className="mb-2 text-[0.88rem]"><Link className="link" href="/panel/teklifler">Teklifler</Link></p>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[2rem]">Teklif <span className="num">#{quote.number}</span></h1>
          <span className={st.cls}>{st.label}</span>
          {quote.source === "portal" && <span className="badge">Portaldan geldi</span>}
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-start gap-2">
            {quote.status === "draft" && <ActionForm action={sendQuoteAction.bind(null, id)}><Submit>Teklifi gönder</Submit></ActionForm>}
            {quote.status === "sent" && (
              <>
                <ActionForm action={decideQuoteAction.bind(null, id, "accepted")}><Submit className="btn btn-secondary">Onaylandı işaretle</Submit></ActionForm>
                <ActionForm action={decideQuoteAction.bind(null, id, "rejected")}><Submit className="btn btn-secondary">Reddedildi işaretle</Submit></ActionForm>
              </>
            )}
            {(quote.status === "sent" || quote.status === "rejected") && <ActionForm action={reopenQuoteAction.bind(null, id)}><Submit className="btn btn-secondary">Taslağa al</Submit></ActionForm>}
            {quote.status !== "accepted" && (
              <ActionForm action={deleteQuoteAction.bind(null, id)} confirm={`#${quote.number} numaralı teklif ve yüklenen çizimler kalıcı olarak silinecek. Devam edilsin mi?`}>
                <Submit className="btn btn-danger">Sil</Submit>
              </ActionForm>
            )}
          </div>
        )}
      </header>

      {quote.status !== "draft" && (
        <div className="note mb-6 flex flex-wrap items-center justify-between gap-3">
          <p>
            {quote.status === "sent" && <>Müşteriniz teklifi bu bağlantıdan görüp onaylayabilir. Geçerlilik: {day(quote.validUntil)}.</>}
            {quote.status === "accepted" && <>Teklif {day(quote.decidedAt)} tarihinde onaylandı. {order && <Link className="link" href="/panel/siparisler">Siparişi görün</Link>}</>}
            {quote.status === "rejected" && <>Teklif {day(quote.decidedAt)} tarihinde reddedildi.</>}
            {quote.selectedOptionId && <span className="mt-1 block font-semibold">Seçilen alternatif: {quote.options.find((o) => o.id === quote.selectedOptionId)?.label}</span>}
            <span className="num mt-1 block break-all text-[0.82rem] text-ink-3">{url}</span>
          </p>
          <div className="flex gap-2"><CopyButton text={url} /><a className="btn btn-secondary btn-sm" href={url} target="_blank" rel="noreferrer">Müşteri görünümü</a></div>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="grid gap-5">
          {editable && <SavedPartPicker quoteId={id} customerId={quote.customerId} parts={parts} />}
          {editable && <UploadDxf quoteId={id} />}
          {!items.length && !editable && <p className="note">Bu teklifte kalem yok.</p>}
          {editable && items.length > 1 && (
            <details className="panel p-4 sm:p-5">
              <summary className="cursor-pointer font-semibold">Toplu düzenleme ve parça listesi</summary>
              <ActionForm action={bulkUpdateItemsAction.bind(null, id)} resetOnOk bulk className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_1fr_8rem_auto]">
                <label><span className="label">Tüm kalemlerin malzemesi</span>
                  <select name="materialId" defaultValue="" className="input input-sm"><option value="">Değiştirme</option>{cat.materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                </label>
                <label><span className="label">Tüm kalemlerin makinesi</span>
                  <select name="machineId" defaultValue="" className="input input-sm"><option value="">Değiştirme</option>{cat.machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                </label>
                <label><span className="label">Kalınlık (mm)</span><input name="thickness" inputMode="decimal" placeholder="Değiştirme" className="input input-sm num" /></label>
                <Submit className="btn btn-secondary btn-sm">Hepsine uygula</Submit>
              </ActionForm>
              <ActionForm action={applyPartsListAction.bind(null, id)} bulk className="mt-5 grid gap-2 border-t border-line pt-4">
                <label><span className="label">Parça listesi</span>
                  <textarea name="list" rows={5} required spellCheck={false} placeholder={"braket\t20\t3\nflans\t8\t1,5"} className="input num" />
                </label>
                <p className="hint">Excel&apos;den kopyalayıp yapıştırın. Sütun sırası: parça adı veya kodu, adet, kalınlık, malzeme. Son iki sütun boş kalabilir. Satırlar kalem adına ya da parça koduna göre eşleşir; eşleşmeyenler size bildirilir, okunamayan bir satır varsa hiçbir kalem değişmez.</p>
                <div><Submit className="btn btn-secondary btn-sm">Listeyi uygula</Submit></div>
              </ActionForm>
            </details>
          )}

          {items.map((it) => {
            const a = it.analysis, r = it.result;
            const thicknesses = [...new Set(cat.cutParams.filter((p) => p.materialId === it.materialId && p.machineId === it.machineId).map((p) => p.thickness))];
            return (
              <article key={it.id} className="panel">
                <div className="grid gap-4 p-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:p-5">
                  <div>
                    <div className="sheet grid aspect-[4/3] place-items-center rounded-[3px] border border-line p-2">
                      <PartPreview preview={a.preview} className="max-h-full max-w-full" weight={1.5} label={`${it.name} önizlemesi`} />
                    </div>
                    <dl className="mt-3 grid gap-1 text-[0.82rem]">
                      <Row k="Ölçü" v={`${num(a.width, 1)} × ${num(a.height, 1)} mm`} />
                      <Row k="Kesim boyu" v={`${num(a.cutLength)} mm`} />
                      <Row k="Delme" v={String(a.pierceCount)} />
                      {a.parts.length > 1 && <Row k="Parça" v={String(a.parts.length)} />}
                      {r && <Row k="Kesim süresi" v={`${num(r.minutesPerUnit, 2)} dk/adet`} />}
                      {r && <Row k="Net ağırlık" v={`${num(r.netWeightKgPerUnit, 3)} kg/adet`} />}
                    </dl>
                    {it.fileId && <a className="link mt-2 inline-block text-[0.82rem]" href={`/api/files/${it.fileId}`}>DXF&apos;i indir</a>}
                  </div>

                  <div className="min-w-0">
                    {editable ? (
                      <ActionForm action={updateItemAction.bind(null, it.id)} auto synced className="grid gap-3 sm:grid-cols-6">
                        <label className="sm:col-span-6"><span className="label">Kalem adı</span><input name="name" defaultValue={it.name} className="input input-sm" required /></label>
                        <label className="sm:col-span-3"><span className="label">Parça kodu</span><input name="partCode" defaultValue={it.partCode} maxLength={80} className="input input-sm" placeholder="Örn. BR-001" /></label>
                        <label className="sm:col-span-3"><span className="label">Revizyon</span><input name="revision" defaultValue={it.revision} maxLength={40} className="input input-sm" placeholder="Örn. A veya 02" /></label>
                        <label className="sm:col-span-3"><span className="label">Malzeme</span>
                          <select name="materialId" defaultValue={it.materialId ?? ""} className="input input-sm">
                            <option value="">Seçin</option>{cat.materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </label>
                        <label className="sm:col-span-3"><span className="label">Makine</span>
                          <select name="machineId" defaultValue={it.machineId ?? ""} className="input input-sm">
                            <option value="">Seçin</option>{cat.machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </label>
                        <label className="sm:col-span-2"><span className="label">Kalınlık (mm)</span>
                          <input name="thickness" defaultValue={it.thickness ?? ""} inputMode="decimal" list={`t-${it.id}`} className="input input-sm num" />
                          <datalist id={`t-${it.id}`}>{thicknesses.map((t) => <option key={t} value={t} />)}</datalist>
                        </label>
                        <label className="sm:col-span-2"><span className="label">Adet</span><input name="qty" type="number" min={1} defaultValue={it.qty} className="input input-sm num" required /></label>
                        <label className="sm:col-span-2"><span className="label">Büküm sayısı</span><input name="bends" type="number" min={0} defaultValue={it.bends} className="input input-sm num" /></label>
                        <label className="sm:col-span-3"><span className="label">Ek işlem (₺/adet)</span><input name="extraPerUnit" inputMode="decimal" defaultValue={it.extraPerUnit || ""} placeholder="Boya, kaynak, havşa" className="input input-sm num" /></label>
                        {cat.operations.length > 0 ? (
                          <fieldset className="sm:col-span-6">
                            <legend className="label">İşlemler (parça başına miktar)</legend>
                            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                              {cat.operations.map((o) => (
                                <label key={o.id} className="flex items-center justify-between gap-3 text-[0.9rem]">
                                  <span>{o.name} <span className="text-ink-3">({OP_UNIT[o.unit]})</span></span>
                                  <input name={`op_${o.id}`} inputMode="decimal" defaultValue={it.ops.find((x) => x.opId === o.id)?.qty ?? ""} placeholder="0" className="input input-sm num w-24" />
                                </label>
                              ))}
                            </div>
                            <p className="hint">Boş bırakılan işlem uygulanmaz. Bu parça: tek yüz {num(a.netArea / 1e6, 3)} m², kesim boyu {num(a.cutLength / 1000, 2)} m.</p>
                          </fieldset>
                        ) : (
                          <p className="hint sm:col-span-6">Boya, kaynak, diş gibi işleri adıyla teklife eklemek için <Link className="link" href="/panel/ayarlar/islemler">işlem kataloğunu</Link> tanımlayın.</p>
                        )}
                        {it.ops.filter((x) => !cat.operations.some((o) => o.id === x.opId)).map((x) => (
                          <p key={x.opId} className="note note-warn text-[0.86rem] sm:col-span-6">&quot;{x.name}&quot; işlemi katalogdan silinmiş. Kalemi kaydettiğinizde bu işlem kalemden kaldırılır.</p>
                        ))}
                        <label className="flex items-center gap-2.5 text-[0.9rem] sm:col-span-6">
                          <input type="checkbox" name="customerMaterial" defaultChecked={it.customerMaterial} className="size-4 accent-[var(--accent)]" />
                          Malzeme müşteriden (yalnız işçilik fiyatlanır)
                        </label>
                        <div className="sm:col-span-6"><Submit className="btn btn-secondary btn-sm">Kaydet</Submit></div>
                      </ActionForm>
                    ) : (
                      <>
                        <h2 className="text-[1.3rem]">{it.name}</h2>
                        {it.partCode && <p className="mt-1 text-[0.84rem] text-ink-2">{it.partCode}{it.revision && ` / Rev. ${it.revision}`}</p>}
                        <p className="mt-1 text-ink-2">
                          {cat.materials.find((m) => m.id === it.materialId)?.name ?? "Malzeme seçilmedi"}, {it.thickness ? `${num(it.thickness, 2)} mm` : "kalınlık yok"}, <span className="num">{it.qty}</span> adet
                          {it.bends > 0 && <>, {it.bends} büküm</>}
                        </p>
                        {(it.ops.length > 0 || it.customerMaterial) && (
                          <p className="mt-1 text-[0.88rem] text-ink-2">{[...it.ops.map((o) => `${o.name} (${num(o.qty, 3)} ${OP_UNIT[o.unit]})`), it.customerMaterial ? "malzeme müşteriden" : ""].filter(Boolean).join(", ")}</p>
                        )}
                      </>
                    )}

                    {a.warnings.length > 0 && (
                      <ul className="mt-4 grid gap-2">{a.warnings.map((w) => <li key={w.code} className="note note-warn text-[0.86rem]">{w.message}</li>)}</ul>
                    )}

                    {a.minHole !== null && it.thickness !== null && it.thickness - a.minHole > 0.01 && (
                      <p className="note note-warn mt-2 text-[0.86rem]">En küçük delik {num(a.minHole, 1)} mm, sac kalınlığından ({num(it.thickness, 2)} mm) küçük. Bu delik temiz kesilemeyebilir; müşteriyle teyit edin.</p>
                    )}

                    {r && (
                      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
                        <details className="text-[0.86rem]">
                          <summary className="cursor-pointer text-ink-2 hover:text-ink">Maliyet dökümü (yalnızca siz görürsünüz)</summary>
                          <dl className="mt-3 grid min-w-[16rem] gap-1.5">
                            <Row k="Makine" v={tl(r.machineCost)} /><Row k={it.customerMaterial ? "Malzeme (müşteriden)" : "Malzeme"} v={tl(r.materialCost)} />
                            {r.bendCost > 0 && <Row k="Büküm" v={tl(r.bendCost)} />}{r.extraCost > 0 && <Row k="İşlemler" v={tl(r.extraCost)} />}
                            {r.setupCost > 0 && <Row k="Hazırlık" v={tl(r.setupCost)} />}<Row k="Kâr" v={tl(r.marginAmount)} />
                            {r.discountAmount > 0 && <Row k={`Adet indirimi (%${num(r.discountPct, 1)})`} v={`-${tl(r.discountAmount)}`} />}
                          </dl>
                        </details>
                        <p className="text-right"><span className="block text-[0.8rem] text-ink-3">Birim <span className="num">{tl(r.unitPrice)}</span></span><span className="num text-[1.3rem] font-semibold">{tl(r.lineTotal)}</span></p>
                      </div>
                    )}
                    {r && it.baseline && <CostComparison baseline={it.baseline} result={r} qty={it.qty} />}
                  </div>
                </div>
                {canWrite && <div className="flex flex-wrap items-start gap-3 border-t border-line px-4 py-3 sm:px-5">
                  {r && it.partCode && it.revision && quote.customerId && <ActionForm action={savePartAction.bind(null, it.id)}><Submit className="btn btn-secondary btn-sm">Revizyonu hafızaya kaydet</Submit></ActionForm>}
                  {editable && <ActionForm action={removeItemAction.bind(null, it.id)} confirm={`"${it.name}" kalemi silinsin mi?`}><Submit className="link text-[0.84rem] text-danger">Kalemi sil</Submit></ActionForm>}
                </div>}
              </article>
            );
          })}
          <QuantityOptionsEditor quoteId={id} items={items} options={quote.options} editable={editable} />
        </div>

        <aside className="grid gap-5 lg:sticky lg:top-6" aria-label="Teklif özeti">
          <section className="panel p-5">
            <h2 className="text-[1.3rem]">Toplam</h2>
            {totals?.ok ? (
              <dl className="mt-4 grid gap-2">
                <Row k="Ara toplam" v={tl(totals.subtotal)} />
                {totals.minOrderAdjustment > 0 && <Row k="Minimum sipariş farkı" v={tl(totals.minOrderAdjustment)} />}
                <Row k="KDV hariç" v={tl(totals.net)} /><Row k="KDV" v={tl(totals.vat)} /><Row k="Genel toplam" v={tl(totals.gross)} strong />
              </dl>
            ) : (
              <p className="note note-warn mt-4">{totals?.error ?? "Teklife en az bir DXF ekleyin."}</p>
            )}
          </section>

          <section className="panel p-5">
            <h2 className="text-[1.3rem]">Müşteri</h2>
            {quote.contact && (
              <p className="mt-3 text-[0.9rem]">
                <strong>{quote.contact.name}</strong>{quote.contact.company && `, ${quote.contact.company}`}<br />
                <a className="link" href={`mailto:${quote.contact.email}`}>{quote.contact.email}</a>{quote.contact.phone && <><br />{quote.contact.phone}</>}
              </p>
            )}
            {editable ? (
              <ActionForm action={updateQuoteAction.bind(null, id)} auto className="mt-3 grid gap-3">
                <label><span className="label">Kayıtlı müşteri</span>
                  <select name="customerId" defaultValue={quote.customerId ?? ""} className="input input-sm">
                    <option value="">Seçilmedi</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <p className="hint -mt-1">E-postası olan müşteriye teklif gönderildiğinde bağlantı e-postayla da iletilir. <Link className="link" href="/panel/musteriler">Müşteri ekle</Link></p>
                <label><span className="label">Müşteriye not</span><textarea name="notes" defaultValue={quote.notes ?? ""} maxLength={2000} className="input" placeholder="Teslim süresi, ödeme koşulu" /></label>
                <div><Submit className="btn btn-secondary btn-sm">Kaydet</Submit></div>
              </ActionForm>
            ) : (
              <>
                {customer && <p className="mt-3"><strong>{customer.name}</strong>{customer.email && <><br /><span className="text-ink-2">{customer.email}</span></>}</p>}
                {!customer && !quote.contact && <p className="mt-3 text-ink-3">Müşteri seçilmedi.</p>}
                {quote.notes && <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-[0.9rem] text-ink-2">{quote.notes}</p>}
              </>
            )}
          </section>

          {nesting.length > 0 && (
            <section className="panel p-5">
              <h2 className="text-[1.3rem]">Plaka yerleşimi</h2>
              <div className="mt-4 grid gap-5">
                {nesting.map((n, i) => {
                  const s = totals?.ok ? totals.stocks[i] : undefined;
                  return (
                    <figure key={n.label}>
                      <NestPreview sheetW={n.sheetW} sheetH={n.sheetH} sheet={n.first} />
                      <figcaption className="mt-2 text-[0.82rem] text-ink-2">
                        <strong className="text-ink">{n.label}</strong><br />
                        <span className="num">{n.sheetCount}</span> plaka ({num(n.sheetW)} × {num(n.sheetH)} mm){s && <>, ücretlenen <span className="num">{num(s.billableWeightKg, 1)}</span> kg, doluluk <span className="num">%{num(s.utilization * 100)}</span></>}
                        {n.sheetCount > 1 && <>. İlk plaka gösteriliyor.</>}{n.estimated && <> Yerleşim örneklemeyle tahmin edildi.</>}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
