import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { billingMode } from "@/server/billing";
import { PLANS, entitlements } from "@/server/core";
import { mailConfigured } from "@/server/mail";
import { adminOverview, adminSupport } from "@/server/privacy";
import { getSession } from "@/server/session";
import { Logo } from "@/ui/bits";
import { day } from "@/ui/format";

export const metadata = { title: "Platform yönetimi", robots: { index: false } };

/** Operator console. Visible only to users flagged is_platform_admin; everyone else gets a 404 so the page's existence is not revealed. */
export default async function AdminPage() {
  const { db, info } = await getSession();
  if (!info) redirect("/giris");
  if (!info.user.isPlatformAdmin) notFound();
  const [orgs, support] = await Promise.all([adminOverview(db), adminSupport(db)]);
  const active = orgs.filter((o) => entitlements(o).active);
  const paying = orgs.filter((o) => o.plan !== "trial" && o.subStatus === "active");
  const mode = billingMode();
  return (
    <main id="icerik" className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-8">
      <div className="flex items-center justify-between"><Logo href="/panel" /><Link className="link" href="/panel">Panele dön</Link></div>
      <h1 className="mt-8 text-[2.2rem]">Platform yönetimi</h1>

      <dl className="panel mt-6 grid grid-cols-2 md:grid-cols-5">
        {[["Firma", orgs.length], ["Etkin", active.length], ["Ödeyen", paying.length], ["Aylık gelir (₺)", paying.reduce((s, o) => s + PLANS[o.plan].priceTry, 0)], ["Destek mesajı", support.length]].map(([k, v]) => (
          <div key={k} className="border-b border-r border-line p-4"><dt className="text-[0.82rem] text-ink-3">{k}</dt><dd className="num mt-1 text-[1.5rem] font-semibold">{v}</dd></div>
        ))}
      </dl>

      <section className="mt-6 grid gap-2">
        <h2 className="text-[1.4rem]">Entegrasyon durumu</h2>
        <p className={`note ${mode === "iyzico" ? "note-ok" : "note-warn"}`}>Ödeme: {mode === "iyzico" ? "iyzico anahtarları tanımlı." : mode === "test" ? "TEST MODU. Gerçek ödeme alınmıyor." : "Kapalı. iyzico anahtarları tanımlı değil; plan satışı yapılamaz."}</p>
        <p className={`note ${mailConfigured() ? "note-ok" : "note-warn"}`}>E-posta: {mailConfigured() ? "SMTP tanımlı." : "SMTP tanımlı değil; e-postalar gönderilmiyor, yalnızca sunucu günlüğüne yazılıyor."}</p>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-[1.4rem]">Firmalar</h2>
        <div className="panel overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Firma</th><th>Plan</th><th>Durum</th><th>Deneme bitişi</th><th>Üye</th><th>Teklif</th><th>Kayıt</th></tr></thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td><strong>{o.name}</strong><br /><span className="num text-[0.8rem] text-ink-3">{o.slug}</span></td>
                  <td>{PLANS[o.plan].name}</td>
                  <td><span className={`badge ${entitlements(o).active ? "badge-ok" : "badge-danger"}`}>{entitlements(o).active ? "Etkin" : "Etkin değil"}</span>{o.subStatus !== "none" && <span className="ml-2 text-[0.82rem] text-ink-3">{o.subStatus}</span>}</td>
                  <td className="text-ink-2">{o.plan === "trial" ? day(o.trialEndsAt) : ""}</td>
                  <td className="num">{o.members}</td><td className="num">{o.quotes}</td><td className="text-ink-2">{day(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-[1.4rem]">Destek mesajları</h2>
        {support.length ? (
          <ul className="grid gap-3">
            {support.map((m) => (
              <li key={m.id} className="panel p-4">
                <p className="flex flex-wrap justify-between gap-2"><strong>{m.subject}</strong><span className="text-[0.84rem] text-ink-3">{m.orgName}, {m.email ?? "silinmiş kullanıcı"}, {day(m.createdAt)}</span></p>
                <p className="mt-2 whitespace-pre-wrap text-ink-2">{m.body}</p>
              </li>
            ))}
          </ul>
        ) : <p className="text-ink-3">Henüz destek mesajı yok.</p>}
      </section>
    </main>
  );
}
