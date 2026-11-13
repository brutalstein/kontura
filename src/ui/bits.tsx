import { type ComponentProps, type ReactNode, useId } from "react";
import Link from "next/link";
import type { NestSheet } from "@/engine";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-display text-[1.45rem] font-bold leading-none tracking-wide" aria-label="Kontura ana sayfa">
      {/* brand mark: a cut plate with a relieved corner and one hole */}
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
        <path d="M3 3h12l6 6v12H3z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <circle cx="10" cy="14" r="3" fill="var(--accent)" />
      </svg>
      Kontura
    </Link>
  );
}

export function Field({ label, hint, className, ...props }: { label: string; hint?: ReactNode } & ComponentProps<"input">) {
  const id = useId();
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input" aria-describedby={hint ? `${id}-h` : undefined} {...props} />
      {hint && <p id={`${id}-h`} className="hint">{hint}</p>}
    </div>
  );
}

export function Select({ label, hint, className, children, ...props }: { label: string; hint?: ReactNode } & ComponentProps<"select">) {
  const id = useId();
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>{label}</label>
      <select id={id} className="input" {...props}>{children}</select>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[2rem]">{title}</h1>
        {sub && <p className="mt-1 max-w-[65ch] text-ink-2">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="panel sheet px-6 py-12 text-center">
      <h2 className="text-[1.35rem]">{title}</h2>
      {children && <div className="mx-auto mt-2 max-w-[52ch] text-ink-2">{children}</div>}
    </div>
  );
}

/** Draws the contours the engine found in a DXF. Coordinates are millimetres with Y up, so Y is flipped for the screen. `weight` is the stroke width in screen pixels (strokes do not scale). */
export function PartPreview({ preview, className, weight = 2, label = "Parça önizlemesi" }: {
  preview: { cut: number[][]; bend: number[][] }; className?: string; weight?: number; label?: string;
}) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const a of [...preview.cut, ...preview.bend]) {
    for (let i = 0; i + 1 < a.length; i += 2) {
      if (a[i] < minX) minX = a[i]; if (a[i] > maxX) maxX = a[i];
      if (a[i + 1] < minY) minY = a[i + 1]; if (a[i + 1] > maxY) maxY = a[i + 1];
    }
  }
  if (!Number.isFinite(minX)) return null;
  const w = Math.max(maxX - minX, 1e-3), h = Math.max(maxY - minY, 1e-3), size = Math.max(w, h), pad = size * 0.05;
  const pts = (a: number[]) => {
    let s = "";
    for (let i = 0; i + 1 < a.length; i += 2) s += `${(a[i] - minX).toFixed(2)},${(maxY - a[i + 1]).toFixed(2)} `;
    return s;
  };
  return (
    <svg viewBox={`${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}`} className={className} role="img" aria-label={label}>
      {preview.cut.map((a, i) => <polyline key={i} className="cut" strokeWidth={weight} pathLength={1} points={pts(a)} />)}
      {preview.bend.map((a, i) => <polyline key={i} className="bend" strokeWidth={1} points={pts(a)} />)}
    </svg>
  );
}

/** One nested sheet: placements as rectangles, plus the length of sheet the job actually uses. */
export function NestPreview({ sheetW, sheetH, sheet }: { sheetW: number; sheetH: number; sheet: NestSheet }) {
  const sw = sheetW / 400;
  return (
    <svg viewBox={`${-sw} ${-sw} ${sheetW + 2 * sw} ${sheetH + 2 * sw}`} className="w-full" role="img" aria-label={`Plaka yerleşimi, ${sheet.placements.length} parça`}>
      <rect width={sheetW} height={sheetH} fill="var(--surface-2)" stroke="var(--line-strong)" strokeWidth={sw} />
      {sheet.placements.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill="color-mix(in srgb, var(--accent) 22%, transparent)" stroke="var(--accent-text)" strokeWidth={sw} />
      ))}
      {sheet.usedLength < sheetW && <line x1={sheet.usedLength} x2={sheet.usedLength} y1={0} y2={sheetH} stroke="var(--ink-3)" strokeWidth={sw * 1.5} strokeDasharray={`${sw * 8} ${sw * 6}`} />}
    </svg>
  );
}
