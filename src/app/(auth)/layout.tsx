import { Logo, PartPreview } from "@/ui/bits";
import { ThemeToggle } from "@/ui/client";
import { num } from "@/ui/format";
import { SAMPLE } from "@/ui/sample";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <main id="icerik" className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between"><Logo /><ThemeToggle /></div>
        <div className="mx-auto my-auto w-full max-w-[26rem] py-10">{children}</div>
      </main>
      <aside className="sheet hidden flex-col justify-center gap-8 border-l border-line p-14 lg:flex">
        <PartPreview preview={SAMPLE.preview} className="max-h-[46dvh] w-full" label="Örnek braket çizimi" />
        <dl className="grid grid-cols-3 gap-6 border-t border-line-strong pt-6">
          {[["Kesim boyu", `${num(SAMPLE.cutLength)} mm`], ["Delme", `${SAMPLE.pierceCount} adet`], ["Büküm", `${SAMPLE.bendCount} adet`]].map(([k, v]) => (
            <div key={k}><dt className="text-[0.8rem] text-ink-3">{k}</dt><dd className="num mt-1 text-[1.25rem] font-semibold">{v}</dd></div>
          ))}
        </dl>
        <p className="max-w-[44ch] text-ink-2">Bu değerleri Kontura örnek DXF dosyasından okudu. Kendi çiziminizle birkaç saniye sürer.</p>
      </aside>
    </div>
  );
}
