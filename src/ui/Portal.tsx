"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Warning } from "@/engine";
import { PartPreview } from "./bits";
import { decodeDxf } from "./decode";
import { num, tl } from "./format";

type Material = { id: string; name: string; thicknesses: number[] };
type Item = { key: number; fileName: string; content: string; materialId: string; thickness: number; qty: number };
type Estimate = {
  items: { name: string; width: number; height: number; cutLength: number; pierceCount: number; warnings: Warning[]; preview: { cut: number[][]; bend: number[][] }; unitPrice: number | null; lineTotal: number | null }[];
  totals: { net: number; vat: number; gross: number } | null;
  error: string | null;
};

const MAX_BYTES = 8 * 1024 * 1024;
let seq = 0;

async function post(slug: string, op: string, body: unknown) {
  const res = await fetch(`/api/portal/${slug}/${op}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? "İstek tamamlanamadı. Lütfen tekrar deneyin.");
  return json;
}
const payload = (list: Item[]) => list.map(({ fileName, content, materialId, thickness, qty }) => ({ fileName, content, materialId, thickness, qty }));

/** The shop's public instant-quote page: upload drawings, pick material and quantity, see the estimate, send the request. */
export function PortalClient({ slug, shop, showPrice, materials }: { slug: string; shop: string; showPrice: boolean; materials: Material[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [estimate, setEstimate] = useState<{ selection: Item[]; value: Estimate | null } | null>(null);
  const est = estimate?.selection === items ? estimate.value : null;
  const busy = items.length > 0 && estimate?.selection !== items;
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  // re-estimate shortly after the selection changes; a newer run makes older answers irrelevant
  useEffect(() => {
    if (!items.length) return;
    let active = true;
    const t = setTimeout(async () => {
      try {
        const r = await post(slug, "tahmin", { items: payload(items) });
        if (active) { setEstimate({ selection: items, value: r }); setError(null); }
      } catch (e) {
        if (active) { setEstimate({ selection: items, value: null }); setError((e as Error).message); }
      }
    }, 500);
    return () => { active = false; clearTimeout(t); };
  }, [items, slug]);

  async function add(files: FileList | null) {
    if (!files) return;
    const next: Item[] = [];
    for (const f of Array.from(files)) {
      if (!/\.dxf$/i.test(f.name)) { setError(`${f.name}: yalnızca .dxf dosyaları desteklenir.`); continue; }
      if (f.size > MAX_BYTES) { setError(`${f.name}: dosya çok büyük (en fazla 8 MB).`); continue; }
      next.push({ key: ++seq, fileName: f.name, content: decodeDxf(await f.arrayBuffer()), materialId: materials[0].id, thickness: materials[0].thicknesses[0], qty: 1 });
    }
    setItems((cur) => [...cur, ...next].slice(0, 10));
  }
  const patch = (key: number, p: Partial<Item>) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...p } : i)));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSending(true);
    try {
      const r = await post(slug, "talep", {
        contact: { name: fd.get("name"), email: fd.get("email"), phone: fd.get("phone") || undefined, company: fd.get("company") || undefined },
        note: fd.get("note") || undefined, items: payload(items),
      });
      setSent(r.number);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (sent !== null) {
    return (
      <div role="status" className="panel sheet px-6 py-14 text-center">
        <h2 className="text-[1.8rem]">Talebiniz iletildi</h2>
        <p className="mx-auto mt-3 max-w-[48ch] text-ink-2">Talep numaranız <strong className="num text-ink">#{sent}</strong>. {shop} çizimlerinizi inceleyip kesin teklifi e-postayla gönderecek.</p>
        <button className="btn btn-secondary mt-6" onClick={() => { setSent(null); setItems([]); }}>Yeni talep oluştur</button>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <label className="sheet flex cursor-pointer flex-col items-center gap-2 rounded-[3px] border border-dashed border-line-strong px-4 py-10 text-center focus-within:outline-2 focus-within:outline-accent-text">
        <span className="text-[1.05rem] font-semibold">DXF dosyalarınızı seçin</span>
        <span className="text-[0.84rem] text-ink-3">1:1 ölçekli, milimetre biriminde. En fazla 10 dosya, dosya başına 8 MB.</span>
        <input type="file" accept=".dxf" multiple className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </label>

      <div aria-live="polite">{error && <p role="alert" className="note note-danger">{error}</p>}</div>

      {items.map((it, idx) => {
        const r = est?.items[idx], mat = materials.find((m) => m.id === it.materialId) ?? materials[0];
        return (
          <article key={it.key} className="panel grid gap-4 p-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:p-5">
            <div className="sheet grid aspect-square place-items-center rounded-[3px] border border-line p-2">
              {r ? <PartPreview preview={r.preview} className="max-h-full max-w-full" weight={1.5} label={`${it.fileName} önizlemesi`} /> : <div className="skeleton size-full" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <h3 className="truncate text-[1.2rem]">{it.fileName}</h3>
                <button type="button" className="link shrink-0 text-[0.84rem] text-danger" onClick={() => setItems((cur) => cur.filter((i) => i.key !== it.key))}>Kaldır</button>
              </div>
              {r && <p className="num mt-1 text-[0.84rem] text-ink-2">{num(r.width, 1)} × {num(r.height, 1)} mm, kesim {num(r.cutLength)} mm, {r.pierceCount} delme</p>}
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label><span className="label">Malzeme</span>
                  <select className="input input-sm" value={it.materialId} onChange={(e) => { const m = materials.find((x) => x.id === e.target.value)!; patch(it.key, { materialId: m.id, thickness: m.thicknesses.includes(it.thickness) ? it.thickness : m.thicknesses[0] }); }}>
                    {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
                <label><span className="label">Kalınlık</span>
                  <select className="input input-sm" value={it.thickness} onChange={(e) => patch(it.key, { thickness: Number(e.target.value) })}>
                    {mat.thicknesses.map((t) => <option key={t} value={t}>{num(t, 2)} mm</option>)}
                  </select>
                </label>
                <label><span className="label">Adet</span>
                  <input className="input input-sm num" type="number" min={1} max={100000} value={it.qty} onChange={(e) => patch(it.key, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
                </label>
              </div>
              {r?.warnings.map((w) => <p key={w.code} className="note note-warn mt-3 text-[0.86rem]">{w.message}</p>)}
              {r?.lineTotal != null && <p className="mt-3 text-right"><span className="text-[0.82rem] text-ink-3">Birim <span className="num">{tl(r.unitPrice!)}</span></span> <span className="num ml-3 text-[1.2rem] font-semibold">{tl(r.lineTotal)}</span></p>}
            </div>
          </article>
        );
      })}

      {items.length > 0 && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <form onSubmit={submit} className="panel grid gap-4 p-5 sm:grid-cols-2">
            <h2 className="text-[1.4rem] sm:col-span-2">Teklif isteyin</h2>
            <label><span className="label">Ad soyad</span><input name="name" className="input" autoComplete="name" required minLength={2} /></label>
            <label><span className="label">Firma</span><input name="company" className="input" autoComplete="organization" /></label>
            <label><span className="label">E-posta</span><input name="email" type="email" className="input" autoComplete="email" required /></label>
            <label><span className="label">Telefon</span><input name="phone" type="tel" className="input" autoComplete="tel" /></label>
            <label className="sm:col-span-2"><span className="label">Not</span><textarea name="note" className="input" maxLength={2000} placeholder="Termin, yüzey işlemi, özel istekler" /></label>
            <label className="flex items-start gap-2.5 text-[0.88rem] text-ink-2 sm:col-span-2">
              <input type="checkbox" required className="mt-1 size-4 accent-[var(--accent)]" />
              <span>Çizimlerimin ve iletişim bilgilerimin teklif hazırlanması için {shop} ile paylaşılmasını kabul ediyorum. <Link className="link" href="/yasal/kvkk" target="_blank">Aydınlatma metni</Link></span>
            </label>
            <div className="sm:col-span-2"><button className="btn btn-primary" disabled={sending || busy}>{sending ? "Gönderiliyor…" : "Talebi gönder"}</button></div>
          </form>

          <aside className="panel p-5" aria-live="polite" aria-busy={busy}>
            <h2 className="text-[1.3rem]">{showPrice ? "Tahmini tutar" : "Özet"}</h2>
            {busy && !est ? <div className="skeleton mt-4 h-24" /> : est?.totals ? (
              <dl className="mt-4 grid gap-2">
                <div className="flex justify-between gap-4"><dt className="text-ink-2">KDV hariç</dt><dd className="num">{tl(est.totals.net)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-ink-2">KDV</dt><dd className="num">{tl(est.totals.vat)}</dd></div>
                <div className="flex justify-between gap-4 border-t border-line-strong pt-3 text-[1.15rem] font-semibold"><dt>Toplam</dt><dd className="num">{tl(est.totals.gross)}</dd></div>
              </dl>
            ) : (
              <p className="mt-3 text-ink-2">{showPrice ? est?.error ?? "Fiyat hesaplanıyor." : `${items.length} parça için talep oluşturuyorsunuz. Fiyatı ${shop} gönderecek.`}</p>
            )}
            {est?.totals && <p className="hint mt-4">Bu tutar otomatik bir tahmindir. Kesin fiyatı {shop} çizimi inceledikten sonra onaylar.</p>}
          </aside>
        </div>
      )}
    </div>
  );
}
