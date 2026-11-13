import { redirect } from "next/navigation";
import { onboardAction } from "@/app/actions";
import { LASER_PRESETS, MATERIAL_PRESETS } from "@/server/catalog";
import { can } from "@/server/core";
import { requireCtx } from "@/server/session";
import { Field } from "@/ui/bits";
import { ActionForm, Submit } from "@/ui/Form";

export const metadata = { title: "Kurulum" };

const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <fieldset className="panel p-5 sm:p-6">
    <legend className="float-left mb-4 flex w-full items-center gap-3 font-display text-[1.35rem] font-semibold">
      <span className="num grid size-7 place-items-center rounded-[3px] bg-accent text-[0.9rem] text-on-accent">{n}</span>{title}
    </legend>
    <div className="clear-both grid gap-4">{children}</div>
  </fieldset>
);

export default async function OnboardingPage() {
  const { info } = await requireCtx();
  if (info.org.onboardedAt) redirect("/panel");
  if (!can(info.role, "settings")) {
    return <p className="note note-warn">Atölye kurulumu henüz tamamlanmamış. Kurulumu firma sahibi veya yöneticisi yapabilir.</p>;
  }
  return (
    <div className="mx-auto max-w-[44rem]">
      <h1 className="text-[2.2rem]">Atölyenizi tanımlayın</h1>
      <p className="mt-2 text-ink-2">İki adımda ilk teklifinize hazırsınız. Buradaki her şeyi sonradan Ayarlar bölümünden değiştirebilirsiniz.</p>
      <ActionForm action={onboardAction} className="mt-7 grid gap-5">
        <Step n={1} title="Kesim makineniz">
          <div className="grid gap-2" role="radiogroup" aria-label="Makine gücü">
            {(Object.keys(LASER_PRESETS) as (keyof typeof LASER_PRESETS)[]).map((k, i) => (
              <label key={k} className="flex cursor-pointer items-center gap-3 rounded-[3px] border border-line-strong px-3 py-2.5 has-[:checked]:border-accent has-[:checked]:bg-surface-2">
                <input type="radio" name="preset" value={k} defaultChecked={i === 0} className="size-4 accent-[var(--accent)]" />
                <span className="font-medium">{LASER_PRESETS[k].label}</span>
              </label>
            ))}
          </div>
          <p className="note note-warn">Seçtiğiniz güç için örnek bir kesim tablosu yüklenir. Bu değerler yalnızca başlangıç içindir; doğru fiyat için Ayarlar › Makineler bölümünden kendi makinenizin kesim hızlarını girin.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Makine adı" name="machineName" defaultValue="Fiber lazer" required />
            <Field label="Dakika ücreti (₺/dk)" name="ratePerMin" inputMode="decimal" required hint="Makinenizin saatlik maliyetini 60'a bölün. Operatör, gaz, elektrik ve amortisman dahil." />
          </div>
        </Step>

        <Step n={2} title="Kestiğiniz malzemeler">
          <p className="text-ink-2">Kullandıklarınızı işaretleyin ve güncel kilogram alış fiyatını yazın. Plaka ölçüsü 3000 × 1500 mm olarak eklenir.</p>
          {MATERIAL_PRESETS.map((m, i) => (
            <div key={m.key} className="grid items-center gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_11rem]">
              <label className="flex cursor-pointer items-center gap-3">
                <input type="checkbox" name={`use_${m.key}`} defaultChecked={i === 0} className="size-4 accent-[var(--accent)]" />
                <span className="font-medium">{m.name}</span>
              </label>
              <label className="flex items-center gap-2">
                <span className="sr-only">{m.name} kilogram fiyatı</span>
                <input name={`price_${m.key}`} inputMode="decimal" className="input" placeholder="₺/kg" />
              </label>
            </div>
          ))}
        </Step>

        <div><Submit>Kurulumu tamamla</Submit></div>
      </ActionForm>
    </div>
  );
}
