import { deleteMachineAction, deleteMaterialAction, deleteOperationAction, saveCutTableAction, saveMachineAction, saveMaterialAction, saveOperationAction, saveRulesAction } from "@/app/actions";
import { listCatalog } from "@/server/catalog";
import type { Authed } from "@/server/session";
import { Field, Select } from "@/ui/bits";
import { ActionForm, Submit } from "@/ui/Form";
import { MACHINE_KIND, OP_UNIT } from "@/ui/format";

type Cat = Awaited<ReturnType<typeof listCatalog>>;

function MachineForm({ m }: { m?: Cat["machines"][number] }) {
  return (
    <ActionForm action={saveMachineAction} resetOnOk={!m} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_10rem_auto] sm:items-end">
      {m && <input type="hidden" name="id" value={m.id} />}
      <Field label="Makine adı" name="name" defaultValue={m?.name} required />
      <Select label="Tür" name="kind" defaultValue={m?.kind ?? "laser"}>{Object.entries(MACHINE_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      <Field label="Dakika ücreti (₺)" name="ratePerMin" inputMode="decimal" defaultValue={m?.ratePerMin} required />
      <Submit className="btn btn-secondary">{m ? "Kaydet" : "Makine ekle"}</Submit>
    </ActionForm>
  );
}

function OperationForm({ o }: { o?: Cat["operations"][number] }) {
  return (
    <ActionForm action={saveOperationAction} resetOnOk={!o} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_9rem_9rem_auto] sm:items-end">
      {o && <input type="hidden" name="id" value={o.id} />}
      <Field label="İşlem adı" name="name" defaultValue={o?.name} placeholder={o ? undefined : "Örn. Toz boya"} required />
      <Select label="Birim" name="unit" defaultValue={o?.unit ?? "adet"}>{Object.entries(OP_UNIT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      <Field label="Birim fiyat (₺)" name="price" inputMode="decimal" defaultValue={o?.price} required />
      <Field label="Parti ücreti (₺)" name="setupFee" inputMode="decimal" defaultValue={o?.setupFee || ""} />
      <Submit className="btn btn-secondary">{o ? "Kaydet" : "İşlem ekle"}</Submit>
    </ActionForm>
  );
}

export async function Operations({ ctx }: Authed) {
  const cat = await listCatalog(ctx);
  return (
    <div className="grid gap-6">
      <p className="max-w-[70ch] text-ink-2">Kesim dışında sattığınız işleri burada tanımlayın: çapak alma, diş, havşa, kaynak, boya. Teklifte her kaleme parça başına miktar girersiniz. Tutar: birim fiyat × miktar × adet, üstüne kalem başına bir kez parti ücreti. Kâr oranı ve adet indirimi bu tutara da uygulanır. Müşteri teklifte yalnızca işlemin adını görür.</p>
      {cat.operations.map((o) => (
        <section key={o.id} className="panel p-5" aria-label={o.name}>
          <OperationForm o={o} />
          <ActionForm action={deleteOperationAction.bind(null, o.id)} confirm={`${o.name} silinsin mi? Bu işlemi kullanan taslak teklifler, işlem kalemden kaldırılana kadar fiyatlanamaz.`} className="mt-4"><Submit className="link text-[0.86rem] text-danger">İşlemi sil</Submit></ActionForm>
        </section>
      ))}
      <section className="panel p-5"><h2 className="mb-4 text-[1.3rem]">Yeni işlem</h2><OperationForm /></section>
    </div>
  );
}

export async function Machines({ ctx }: Authed) {
  const cat = await listCatalog(ctx);
  return (
    <div className="grid gap-6">
      <p className="max-w-[70ch] text-ink-2">Kesim süresi, her malzeme için girdiğiniz kesim tablosundan hesaplanır: kontur boyu ÷ kesim hızı + delme sayısı × delme süresi. Tablodaki iki kalınlık arası aradeğerle bulunur; tablonun dışındaki kalınlığa fiyat verilmez.</p>
      {cat.machines.map((m) => (
        <section key={m.id} className="panel p-5" aria-label={m.name}>
          <MachineForm m={m} />
          <h3 className="mt-6 text-[1.15rem]">Kesim tabloları</h3>
          {!cat.materials.length && <p className="mt-2 text-ink-3">Önce Malzemeler bölümünden malzeme ekleyin.</p>}
          <div className="mt-2 divide-y divide-line border-y border-line">
            {cat.materials.map((mat) => {
              const rows = cat.cutParams.filter((p) => p.machineId === m.id && p.materialId === mat.id);
              return (
                <details key={mat.id} className="group py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">
                    {mat.name}<span className="text-[0.84rem] font-normal text-ink-3">{rows.length ? `${rows.length} kalınlık` : "Tablo yok, bu malzeme bu makinede fiyatlanamaz"} <span aria-hidden className="ml-1 inline-block group-open:rotate-180">▾</span></span>
                  </summary>
                  <ActionForm action={saveCutTableAction.bind(null, m.id, mat.id)} className="mt-3">
                    <div className="overflow-x-auto">
                      <table className="tbl max-w-[34rem]">
                        <thead><tr><th>Kalınlık (mm)</th><th>Kesim hızı (mm/dk)</th><th>Delme süresi (sn)</th></tr></thead>
                        <tbody>
                          {[...rows, null, null, null].map((r, i) => (
                            <tr key={r?.id ?? `new-${i}`}>
                              <td><input name="thickness" aria-label="Kalınlık" inputMode="decimal" defaultValue={r?.thickness} className="input input-sm num" /></td>
                              <td><input name="feedMmMin" aria-label="Kesim hızı" inputMode="decimal" defaultValue={r?.feedMmMin} className="input input-sm num" /></td>
                              <td><input name="pierceSec" aria-label="Delme süresi" inputMode="decimal" defaultValue={r?.pierceSec} className="input input-sm num" /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="hint">Bir satırı silmek için kalınlık ve hız alanlarını boşaltın. Boş satırlara yeni kalınlık ekleyebilirsiniz.</p>
                    <div className="mt-3"><Submit className="btn btn-secondary btn-sm">Tabloyu kaydet</Submit></div>
                  </ActionForm>
                </details>
              );
            })}
          </div>
          <ActionForm action={deleteMachineAction.bind(null, m.id)} confirm={`${m.name} ve kesim tabloları silinsin mi?`} className="mt-4"><Submit className="link text-[0.86rem] text-danger">Makineyi sil</Submit></ActionForm>
        </section>
      ))}
      <section className="panel p-5"><h2 className="mb-4 text-[1.3rem]">Yeni makine</h2><MachineForm /></section>
    </div>
  );
}

function MaterialForm({ m }: { m?: Cat["materials"][number] }) {
  return (
    <ActionForm action={saveMaterialAction} resetOnOk={!m} className="grid gap-3 sm:grid-cols-6 sm:items-end">
      {m && <input type="hidden" name="id" value={m.id} />}
      <Field className="sm:col-span-3" label="Malzeme adı" name="name" defaultValue={m?.name} required />
      <Field className="sm:col-span-1" label="Yoğunluk (g/cm³)" name="densityGcm3" inputMode="decimal" defaultValue={m?.densityGcm3} required />
      <Field className="sm:col-span-1" label="Fiyat (kg)" name="pricePerKg" inputMode="decimal" defaultValue={m?.pricePerKg} required />
      <Select className="sm:col-span-1" label="Para birimi" name="currency" defaultValue={m?.currency ?? "TRY"}><option>TRY</option><option>USD</option><option>EUR</option></Select>
      <Field className="sm:col-span-2" label="Plaka boyu (mm)" name="sheetW" inputMode="decimal" defaultValue={m?.sheetW ?? 3000} required />
      <Field className="sm:col-span-2" label="Plaka eni (mm)" name="sheetH" inputMode="decimal" defaultValue={m?.sheetH ?? 1500} required />
      <div className="sm:col-span-2"><Submit className="btn btn-secondary">{m ? "Kaydet" : "Malzeme ekle"}</Submit></div>
    </ActionForm>
  );
}

export async function Materials({ ctx }: Authed) {
  const cat = await listCatalog(ctx);
  return (
    <div className="grid gap-6">
      <p className="max-w-[70ch] text-ink-2">Malzeme maliyeti, yerleşimde kullanılan plaka ağırlığı × kilogram fiyatıdır. Dolar veya avro ile fiyatlanan malzemeler Fiyatlandırma bölümündeki kurla liraya çevrilir.</p>
      {cat.materials.map((m) => (
        <section key={m.id} className="panel p-5" aria-label={m.name}>
          <MaterialForm m={m} />
          <ActionForm action={deleteMaterialAction.bind(null, m.id)} confirm={`${m.name} ve bu malzemenin kesim tabloları silinsin mi?`} className="mt-4"><Submit className="link text-[0.86rem] text-danger">Malzemeyi sil</Submit></ActionForm>
        </section>
      ))}
      <section className="panel p-5"><h2 className="mb-4 text-[1.3rem]">Yeni malzeme</h2><MaterialForm /></section>
    </div>
  );
}

export function Pricing({ info }: Authed) {
  const r = info.org.rules;
  const n = (label: string, name: string, value: number, hint?: string) => <Field label={label} name={name} inputMode="decimal" defaultValue={value} hint={hint} required />;
  return (
    <ActionForm action={saveRulesAction} className="grid max-w-[52rem] gap-6">
      <fieldset className="panel grid gap-4 p-5 sm:grid-cols-2">
        <legend className="float-left mb-1 w-full font-display text-[1.3rem] font-semibold sm:col-span-2">Fiyat</legend>
        {n("Kâr oranı (%)", "marginPct", r.marginPct, "Makine, malzeme ve işçilik maliyetinin üzerine eklenir.")}
        {n("KDV (%)", "vatPct", r.vatPct)}
        {n("Kalem başına hazırlık ücreti (₺)", "setupFee", r.setupFee, "Program ve tezgâh hazırlığı için, her kaleme bir kez.")}
        {n("Minimum sipariş tutarı (₺)", "minOrder", r.minOrder, "Teklif bu tutarın altında kalırsa fark eklenir.")}
        {n("Büküm ücreti (₺/büküm)", "bendRate", r.bendRate)}
        {n("Büküm hazırlık ücreti (₺/kalem)", "bendSetup", r.bendSetup)}
        {n("Teklif geçerlilik süresi (gün)", "validityDays", r.validityDays)}
      </fieldset>
      <fieldset className="panel grid gap-4 p-5 sm:grid-cols-2">
        <legend className="float-left mb-1 w-full font-display text-[1.3rem] font-semibold sm:col-span-2">Yerleşim ve süre</legend>
        {n("Plaka kenar payı (mm)", "sheetMargin", r.sheetMargin)}
        {n("Parçalar arası boşluk (mm)", "partGap", r.partGap)}
        {n("Delmeler arası geçiş süresi (sn)", "rapidSecPerPierce", r.rapidSecPerPierce, "Kafanın bir konturdan diğerine gitme süresi.")}
        <Select label="Artan plaka" name="remnantPolicy" defaultValue={r.remnantPolicy} hint="Son plakadan artan parçayı kimin ödeyeceğini belirler.">
          <option value="used-length">Yalnızca kullanılan boyu ücretlendir</option>
          <option value="full-sheet">Tam plaka ücretlendir</option>
        </Select>
      </fieldset>
      <fieldset className="panel grid gap-4 p-5 sm:grid-cols-2">
        <legend className="float-left mb-1 w-full font-display text-[1.3rem] font-semibold sm:col-span-2">Döviz kurları</legend>
        {n("1 USD kaç ₺", "fxUSD", r.fx.USD, "Yalnızca dolarla fiyatlı malzemeniz varsa gerekir.")}
        {n("1 EUR kaç ₺", "fxEUR", r.fx.EUR)}
      </fieldset>
      <fieldset className="panel p-5">
        <legend className="float-left mb-1 w-full font-display text-[1.3rem] font-semibold">Adet indirimleri</legend>
        <p className="clear-both text-ink-2">Bir kalemin adedi eşiğe ulaştığında o kaleme indirim uygulanır. Boş bırakılan satırlar kaydedilmez.</p>
        <div className="mt-3 grid max-w-[24rem] grid-cols-2 gap-x-3 gap-y-2">
          <span className="label mb-0">En az adet</span><span className="label mb-0">İndirim (%)</span>
          {[...r.qtyBreaks, null, null].map((b, i) => (
            <div key={i} className="contents">
              <input name="minQty" aria-label="En az adet" inputMode="numeric" defaultValue={b?.minQty} className="input input-sm num" />
              <input name="discountPct" aria-label="İndirim yüzdesi" inputMode="decimal" defaultValue={b?.discountPct} className="input input-sm num" />
            </div>
          ))}
        </div>
      </fieldset>
      <div><Submit>Kuralları kaydet</Submit></div>
    </ActionForm>
  );
}
