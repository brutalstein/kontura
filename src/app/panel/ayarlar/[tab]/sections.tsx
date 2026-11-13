import {
  cancelSubscriptionAction, changePasswordAction, changePlanAction, deleteOrgAction, inviteAction, removeMemberAction, revokeInviteAction,
  saveCompanyAction, savePortalAction, setRoleAction, startCheckoutAction,
} from "@/app/actions";
import { listInvites, listMembers } from "@/server/auth";
import { billingMode } from "@/server/billing";
import { PLANS, type PlanId, ROLE_LABEL, can, entitlements } from "@/server/core";
import { appUrl } from "@/server/mail";
import { recentAudit } from "@/server/privacy";
import type { Authed } from "@/server/session";
import { Field, Select } from "@/ui/bits";
import { CopyButton } from "@/ui/client";
import { ActionForm, Submit } from "@/ui/Form";
import { day, num } from "@/ui/format";

const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="mb-4 text-[1.3rem]">{children}</h2>;

export async function Company({ ctx, info }: Authed) {
  const c = info.org.company, log = await recentAudit(ctx);
  return (
    <div className="grid max-w-[52rem] gap-6">
      <section className="panel p-5">
        <H2>Firma bilgileri</H2>
        <p className="-mt-2 mb-4 text-ink-2">Bu bilgiler müşterinize giden teklif sayfasında ve çıktısında görünür.</p>
        <ActionForm action={saveCompanyAction} className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2" label="Firma adı" name="name" defaultValue={info.org.name} required />
          <Field label="Vergi dairesi" name="taxOffice" defaultValue={c.taxOffice} />
          <Field label="Vergi no" name="taxNo" defaultValue={c.taxNo} />
          <Field label="Telefon" name="phone" type="tel" defaultValue={c.phone} />
          <Field label="E-posta" name="email" type="email" defaultValue={c.email} />
          <label className="sm:col-span-2"><span className="label">Adres</span><textarea name="address" defaultValue={c.address} maxLength={300} className="input" /></label>
          <div><Submit>Kaydet</Submit></div>
        </ActionForm>
      </section>
      <section>
        <H2>Son işlemler</H2>
        {log.length ? (
          <div className="panel overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Tarih</th><th>Kişi</th><th>İşlem</th><th>Ayrıntı</th></tr></thead>
              <tbody>{log.map((l, i) => <tr key={i}><td className="whitespace-nowrap text-ink-2">{l.createdAt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" })}</td><td>{l.userName ?? "Sistem"}</td><td className="num text-[0.84rem]">{l.action}</td><td className="text-ink-2">{l.detail}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className="text-ink-3">Henüz kayıt yok.</p>}
      </section>
    </div>
  );
}

export async function Team({ ctx, info }: Authed) {
  const manage = can(info.role, "team");
  const [members, invites] = await Promise.all([listMembers(ctx), manage ? listInvites(ctx) : []]);
  const ent = entitlements(info.org);
  return (
    <div className="grid max-w-[56rem] gap-6">
      <section>
        <H2>Ekip üyeleri <span className="num text-ink-3">{members.length} / {ent.seats}</span></H2>
        <ul className="panel divide-y divide-line">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <p><span className="font-medium">{m.name}</span>{m.userId === ctx.userId && <span className="badge ml-2">Siz</span>}<br /><span className="text-[0.86rem] text-ink-2">{m.email}</span></p>
              {manage && m.userId !== ctx.userId ? (
                <div className="flex flex-wrap items-start gap-2">
                  <ActionForm action={setRoleAction.bind(null, m.userId)} auto>
                    <label><span className="sr-only">{m.name} rolü</span>
                      <select name="role" defaultValue={m.role} className="input input-sm">{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                    </label>
                  </ActionForm>
                  <ActionForm action={removeMemberAction.bind(null, m.userId)} confirm={`${m.name} ekipten çıkarılsın mı?`}><Submit className="btn btn-danger btn-sm">Çıkar</Submit></ActionForm>
                </div>
              ) : <span className="badge">{ROLE_LABEL[m.role]}</span>}
            </li>
          ))}
        </ul>
        <p className="hint mt-3">Sahip: her şey ve abonelik. Yönetici: ayarlar ve ekip. Teklifçi: teklif, müşteri, sipariş. İzleyici: yalnızca görüntüleme.</p>
      </section>

      {manage && (
        <section className="panel p-5">
          <H2>Ekibe davet et</H2>
          <ActionForm action={inviteAction} resetOnOk className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
            <Field label="E-posta" name="email" type="email" required />
            <Select label="Rol" name="role" defaultValue="estimator"><option value="admin">Yönetici</option><option value="estimator">Teklifçi</option><option value="viewer">İzleyici</option></Select>
            <Submit>Davet gönder</Submit>
          </ActionForm>
          {invites.length > 0 && (
            <ul className="mt-5 divide-y divide-line border-t border-line">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <p>{i.email} <span className="badge ml-2">{i.role ? ROLE_LABEL[i.role] : ""}</span><span className="ml-2 text-[0.84rem] text-ink-3">Son gün {day(i.expiresAt)}</span></p>
                  <ActionForm action={revokeInviteAction.bind(null, i.id)}><Submit className="link text-[0.86rem] text-danger">Daveti iptal et</Submit></ActionForm>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export function Portal({ info }: Authed) {
  const ent = entitlements(info.org), url = `${appUrl()}/p/${info.org.slug}`;
  return (
    <div className="grid max-w-[46rem] gap-6">
      <p className="text-ink-2">Portal, müşterinizin DXF yükleyip malzeme ve adet seçerek sizden teklif istediği, firmanıza özel sayfadır. Gelen her talep Teklifler listesine taslak olarak düşer; siz onaylamadan müşteriye bağlayıcı fiyat gitmez.</p>
      {!ent.portal && <p className="note note-warn">Müşteri portalı Atölye ve Pro planlarında kullanılabilir.</p>}
      <section className="panel p-5">
        <ActionForm action={savePortalAction} className="grid gap-4">
          <label className="flex items-start gap-3"><input type="checkbox" name="enabled" defaultChecked={info.org.portalEnabled} className="mt-1 size-4 accent-[var(--accent)]" /><span><span className="font-medium">Portalı yayına al</span><span className="hint mt-0 block">Kapalıyken adres “bulunamadı” gösterir.</span></span></label>
          <label className="flex items-start gap-3"><input type="checkbox" name="showPrice" defaultChecked={info.org.portalShowPrice} className="mt-1 size-4 accent-[var(--accent)]" /><span><span className="font-medium">Ziyaretçiye tahmini fiyatı göster</span><span className="hint mt-0 block">Kapalıysa müşteri yalnızca parça analizini görür, fiyatı siz gönderirsiniz.</span></span></label>
          <div><Submit>Kaydet</Submit></div>
        </ActionForm>
      </section>
      {info.org.portalEnabled && ent.portal && (
        <section className="panel flex flex-wrap items-center justify-between gap-3 p-5">
          <p><span className="label mb-1">Portal adresiniz</span><a className="link num break-all" href={url} target="_blank" rel="noreferrer">{url}</a></p>
          <CopyButton text={url} label="Adresi kopyala" />
        </section>
      )}
    </div>
  );
}

const PAID: Exclude<PlanId, "trial">[] = ["starter", "workshop", "pro"];
const planFeatures = (id: PlanId) => {
  const p = PLANS[id];
  return [Number.isFinite(p.quotesPerMonth) ? `Ayda ${p.quotesPerMonth} teklif` : "Sınırsız teklif", `${p.seats} kullanıcı`, p.portal ? "Müşteri portalı" : "Müşteri portalı yok"];
};

export function Billing({ info, result }: Authed & { result?: string }) {
  const org = info.org, ent = entitlements(org), mode = billingMode(), owner = can(info.role, "billing");
  const paid = org.plan !== "trial" && (org.subStatus === "active" || org.subStatus === "past_due");
  return (
    <div className="grid max-w-[60rem] gap-6">
      {result === "ok" && <p role="status" className="note note-ok">Ödemeniz alındı, aboneliğiniz etkin.</p>}
      {result === "hata" && <p role="alert" className="note note-danger">Ödeme tamamlanamadı veya doğrulanamadı. Kartınızdan tutar çekildiyse destek ile iletişime geçin.</p>}

      <section className="panel p-5">
        <H2>Mevcut plan</H2>
        <p className="text-[1.1rem]"><strong>{PLANS[org.plan].name}</strong> <span className={`badge ml-2 ${ent.active ? "badge-ok" : "badge-danger"}`}>{ent.active ? "Etkin" : "Etkin değil"}</span></p>
        <p className="mt-2 text-ink-2">
          {org.plan === "trial" && (ent.active ? `Deneme süreniz ${day(org.trialEndsAt)} tarihinde biter (${ent.trialDaysLeft} gün).` : "Deneme süreniz doldu. Verileriniz saklanıyor; devam etmek için plan seçin.")}
          {paid && org.subRenewsAt && `Sonraki yenileme: ${day(org.subRenewsAt)}.`}
          {org.subStatus === "canceled" && org.subRenewsAt && `Abonelik iptal edildi. Erişiminiz ${day(org.subRenewsAt)} tarihine kadar sürer.`}
        </p>
      </section>

      <section>
        <H2>Planlar</H2>
        <div className="grid gap-4 md:grid-cols-3">
          {PAID.map((id) => (
            <div key={id} className={`panel flex flex-col p-5 ${org.plan === id && paid ? "border-accent" : ""}`}>
              <h3 className="text-[1.3rem]">{PLANS[id].name}</h3>
              <p className="mt-1 text-[0.88rem] text-ink-2">{PLANS[id].tagline}</p>
              <p className="num mt-4 text-[1.6rem] font-semibold">₺{num(PLANS[id].priceTry)}<span className="ml-1 font-sans text-[0.85rem] font-normal text-ink-3">/ ay + KDV</span></p>
              <ul className="mt-4 grid gap-1.5 text-[0.9rem] text-ink-2">{planFeatures(id).map((f) => <li key={f}>{f}</li>)}</ul>
              {owner && paid && org.subStatus === "active" && org.plan !== id && (
                <ActionForm action={changePlanAction.bind(null, id)} confirm={`Planınız ${PLANS[id].name} olarak değiştirilsin mi? Fark, ödeme sağlayıcı tarafından hesaplanır.`} className="mt-5"><Submit className="btn btn-secondary btn-sm">Bu plana geç</Submit></ActionForm>
              )}
              {org.plan === id && paid && <p className="badge badge-accent mt-5 self-start">Planınız</p>}
            </div>
          ))}
        </div>
      </section>

      {!owner && <p className="note">Abonelik işlemlerini yalnızca firma sahibi yapabilir.</p>}

      {owner && !paid && (
        <section className="panel p-5">
          <H2>Plan satın al</H2>
          {mode === "off" ? (
            <p className="note note-warn">Çevrimiçi ödeme bu kurulumda henüz etkin değil. Plan satın almak için Destek bölümünden bize yazın; aboneliğinizi biz tanımlayalım.</p>
          ) : (
            <>
              {mode === "test" && <p className="note note-warn mb-4"><strong>TEST MODU.</strong> Bu ortamda gerçek ödeme alınmaz; form gönderildiğinde seçtiğiniz plan ücretsiz etkinleşir.</p>}
              {mode === "iyzico" && <p className="mb-4 text-ink-2">Ödeme iyzico güvenli ödeme sayfasında alınır. Kart bilgileriniz Kontura sunucularına ulaşmaz. Fatura bilgileri yalnızca ödeme sağlayıcıya iletilir, saklanmaz.</p>}
              <ActionForm action={startCheckoutAction} className="grid gap-4 sm:grid-cols-2">
                <Select className="sm:col-span-2" label="Plan" name="plan" defaultValue="workshop">{PAID.map((id) => <option key={id} value={id}>{PLANS[id].name}, ₺{num(PLANS[id].priceTry)} / ay + KDV</option>)}</Select>
                <Field label="Ad" name="name" autoComplete="given-name" required />
                <Field label="Soyad" name="surname" autoComplete="family-name" required />
                <Field label="E-posta" name="email" type="email" autoComplete="email" defaultValue={info.user.email} required />
                <Field label="Cep telefonu" name="gsmNumber" type="tel" autoComplete="tel" placeholder="+905XXXXXXXXX" required />
                <Field label="TCKN veya VKN" name="identityNumber" inputMode="numeric" required hint="Fatura için gereklidir." />
                <Field label="Şehir" name="city" autoComplete="address-level1" required />
                <label className="sm:col-span-2"><span className="label">Fatura adresi</span><textarea name="address" autoComplete="street-address" required minLength={5} maxLength={300} className="input" /></label>
                <div><Submit>{mode === "test" ? "Test aboneliğini başlat" : "Ödemeye geç"}</Submit></div>
              </ActionForm>
            </>
          )}
        </section>
      )}

      {owner && paid && org.subStatus === "active" && (
        <section className="panel p-5">
          <H2>Aboneliği iptal et</H2>
          <p className="mb-4 text-ink-2">Yenileme durdurulur. Ödediğiniz dönemin sonuna kadar tüm özellikleri kullanmaya devam edersiniz; sonrasında verileriniz saklanır, yalnızca düzenleme kapanır.</p>
          <ActionForm action={cancelSubscriptionAction} confirm="Aboneliğiniz iptal edilsin mi?"><Submit className="btn btn-danger">Aboneliği iptal et</Submit></ActionForm>
        </section>
      )}

      {owner && (
        <section className="panel p-5">
          <H2>Verileriniz</H2>
          <p className="text-ink-2">Firmanıza ait tüm kayıtları (teklifler, müşteriler, çizimler, ayarlar) tek bir JSON dosyası olarak indirebilirsiniz.</p>
          <a className="btn btn-secondary mt-3" href="/api/export" download>Verilerimi indir</a>
          <div className="mt-6 border-t border-line pt-5">
            <h3 className="text-[1.15rem] text-danger">Firmayı ve tüm verileri sil</h3>
            <p className="mt-1 text-ink-2">Bu işlem geri alınamaz. Teklifler, çizimler, müşteriler ve yalnızca bu firmaya bağlı kullanıcı hesapları kalıcı olarak silinir. Etkin aboneliği önce iptal etmelisiniz.</p>
            <ActionForm action={deleteOrgAction} confirm="Firma ve tüm veriler kalıcı olarak silinecek. Emin misiniz?" className="mt-3 grid max-w-[26rem] gap-3">
              <Field label={`Onay için firma adını yazın: ${org.name}`} name="confirm" autoComplete="off" required />
              <div><Submit className="btn btn-danger">Kalıcı olarak sil</Submit></div>
            </ActionForm>
          </div>
        </section>
      )}
    </div>
  );
}

export function Account({ info }: Authed) {
  return (
    <div className="grid max-w-[30rem] gap-6">
      <section className="panel p-5">
        <H2>Hesabım</H2>
        <dl className="grid gap-2">
          <div><dt className="text-[0.82rem] text-ink-3">Ad soyad</dt><dd>{info.user.name}</dd></div>
          <div><dt className="text-[0.82rem] text-ink-3">E-posta</dt><dd>{info.user.email} {info.user.emailVerifiedAt ? <span className="badge badge-ok ml-1">Doğrulandı</span> : <span className="badge badge-warn ml-1">Doğrulanmadı</span>}</dd></div>
          <div><dt className="text-[0.82rem] text-ink-3">Rol</dt><dd>{ROLE_LABEL[info.role]}</dd></div>
        </dl>
      </section>
      <section className="panel p-5">
        <H2>Şifre değiştir</H2>
        <ActionForm action={changePasswordAction} resetOnOk className="grid gap-4">
          <Field label="Mevcut şifre" name="current" type="password" autoComplete="current-password" required />
          <Field label="Yeni şifre" name="next" type="password" autoComplete="new-password" required minLength={10} hint="En az 10 karakter." />
          <div><Submit>Şifreyi değiştir</Submit></div>
        </ActionForm>
      </section>
    </div>
  );
}
