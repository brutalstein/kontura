"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CircleHalf, Copy, FileText, GearSix, Lifebuoy, Package, SquaresFour, UploadSimple, Users } from "@phosphor-icons/react";

export function ThemeToggle() {
  return (
    <button
      type="button" className="btn btn-ghost btn-sm" aria-label="Açık / koyu temayı değiştir"
      onClick={() => {
        const root = document.documentElement;
        const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
        root.dataset.theme = dark ? "light" : "dark";
        document.cookie = `theme=${root.dataset.theme}; path=/; max-age=31536000; samesite=lax`;
      }}
    >
      <CircleHalf size={18} aria-hidden />
    </button>
  );
}

export function CopyButton({ text, label = "Bağlantıyı kopyala" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button" className="btn btn-secondary btn-sm"
      onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); }}
    >
      <Copy size={16} aria-hidden /> <span aria-live="polite">{done ? "Kopyalandı" : label}</span>
    </button>
  );
}

export function PrintButton() {
  return <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>Yazdır / PDF kaydet</button>;
}

const NAV = [
  { href: "/panel", label: "Genel bakış", icon: SquaresFour },
  { href: "/panel/teklifler", label: "Teklifler", icon: FileText },
  { href: "/panel/parcalar", label: "Parça hafızası", icon: SquaresFour },
  { href: "/panel/siparisler", label: "Siparişler", icon: Package },
  { href: "/panel/musteriler", label: "Müşteriler", icon: Users },
  { href: "/panel/ayarlar/firma", match: "/panel/ayarlar", label: "Ayarlar", icon: GearSix },
  { href: "/panel/destek", label: "Destek", icon: Lifebuoy },
];

export function PanelNav() {
  const path = usePathname();
  return (
    <nav aria-label="Ana menü" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {NAV.map(({ href, match, label, icon: Icon }) => {
        const m = match ?? href;
        const active = m === "/panel" ? path === "/panel" : path.startsWith(m);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2.5 rounded-[3px] px-3 py-2 text-[0.92rem] font-medium ${active ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
            <Icon size={18} weight={active ? "fill" : "regular"} aria-hidden className={active ? "text-accent-text" : ""} /> {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function TabLink({ href, children }: { href: string; children: React.ReactNode }) {
  const active = usePathname() === href;
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={`shrink-0 border-b-2 px-1 pb-2.5 text-[0.92rem] font-medium ${active ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
      {children}
    </Link>
  );
}

/** Uploads DXF files to a draft quote one by one, then reloads the quote. */
export function UploadDxf({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [over, setOver] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const failed: string[] = [];
    for (const file of Array.from(files)) {
      setBusy(file.name);
      const fd = new FormData();
      fd.set("file", file);
      try {
        const res = await fetch(`/api/quotes/${quoteId}/items`, { method: "POST", body: fd });
        if (!res.ok) failed.push((await res.json().catch(() => null))?.error ?? `${file.name}: yüklenemedi.`);
      } catch {
        failed.push(`${file.name}: bağlantı hatası.`);
      }
    }
    setBusy(null);
    setErrors(failed);
    router.refresh();
  }

  return (
    <div>
      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
        className={`sheet flex cursor-pointer flex-col items-center gap-2 rounded-[3px] border border-dashed px-4 py-8 text-center focus-within:outline-2 focus-within:outline-accent-text ${over ? "border-accent" : "border-line-strong"}`}
      >
        <UploadSimple size={26} aria-hidden className="text-accent-text" />
        <span className="font-semibold">{busy ? `${busy} analiz ediliyor…` : "DXF dosyalarını sürükleyin veya seçin"}</span>
        <span className="text-[0.82rem] text-ink-3">Her dosya bir kalem olur. En fazla 8 MB, yalnızca .dxf</span>
        <input type="file" accept=".dxf" multiple className="sr-only" disabled={!!busy} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      </label>
      <div aria-live="polite">
        {errors.map((e) => <p key={e} role="alert" className="note note-danger mt-3">{e}</p>)}
      </div>
    </div>
  );
}
