import { mailDisabled } from "@/server/mail";
import Link from "next/link";
import { logoutAction, resendVerifyAction, switchOrgAction } from "@/app/actions";
import { ROLE_LABEL, entitlements } from "@/server/core";
import { requireCtx } from "@/server/session";
import { Logo } from "@/ui/bits";
import { PanelNav, ThemeToggle } from "@/ui/client";
import { ActionForm, Submit } from "@/ui/Form";

export const metadata = { title: { default: "Panel", template: "%s | Kontura" }, robots: { index: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { info } = await requireCtx();
  const ent = entitlements(info.org);
  return (
    <div className="flex min-h-[100dvh] flex-col md:flex-row">
      <aside className="no-print flex flex-col gap-3 border-b border-line bg-surface p-3 md:sticky md:top-0 md:h-[100dvh] md:w-60 md:shrink-0 md:border-b-0 md:border-r md:p-4">
        <div className="flex items-center justify-between gap-2 md:mb-3">
          <Logo href="/panel" />
          <ThemeToggle />
        </div>
        <PanelNav />
        <details className="group relative md:mt-auto">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-[3px] border border-line px-3 py-2 hover:border-line-strong">
            <span className="min-w-0">
              <span className="block truncate text-[0.9rem] font-semibold">{info.org.name}</span>
              <span className="block truncate text-[0.78rem] text-ink-3">{info.user.name} · {ROLE_LABEL[info.role]}</span>
            </span>
            <span aria-hidden className="text-ink-3 group-open:rotate-180">▾</span>
          </summary>
          <div className="panel absolute inset-x-0 top-full z-20 mt-1 grid gap-3 p-3 shadow-[0_12px_32px_-12px_color-mix(in_srgb,var(--ink)_35%,transparent)] md:bottom-full md:top-auto md:mb-1 md:mt-0">
            {info.orgsOfUser.length > 1 && (
              <form action={switchOrgAction} className="grid gap-2">
                <label className="label mb-0" htmlFor="org-switch">Firma değiştir</label>
                <select id="org-switch" name="orgId" defaultValue={info.org.id} className="input input-sm">
                  {info.orgsOfUser.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <button className="btn btn-secondary btn-sm">Geç</button>
              </form>
            )}
            <Link href="/panel/ayarlar/hesap" className="link text-[0.9rem]">Hesap ve şifre</Link>
            {info.user.isPlatformAdmin && <Link href="/yonetim" className="link text-[0.9rem]">Platform yönetimi</Link>}
            <form action={logoutAction}><button className="btn btn-secondary btn-sm w-full">Çıkış yap</button></form>
          </div>
        </details>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="no-print grid gap-2 px-4 pt-4 empty:hidden sm:px-8">
          {!ent.active && (
            <p role="alert" className="note note-danger">{ent.reason} Verileriniz duruyor; yalnızca yeni kayıt ve düzenleme kapalı. <Link className="link" href="/panel/ayarlar/abonelik">Planları görün</Link></p>
          )}
          {ent.active && ent.trialDaysLeft !== null && (
            <p className="note">Deneme sürenizin bitmesine <strong className="num">{ent.trialDaysLeft}</strong> gün kaldı. <Link className="link" href="/panel/ayarlar/abonelik">Plan seçin</Link></p>
          )}
          {info.org.subStatus === "past_due" && (
            <p role="alert" className="note note-warn">Son ödemeniz alınamadı. Ödeme sağlayıcı kartınızı yeniden deneyecek; kart bilgilerinizi kontrol edin. <Link className="link" href="/panel/ayarlar/abonelik">Abonelik</Link></p>
          )}
          {!info.user.emailVerifiedAt && !mailDisabled() && (
            <ActionForm action={resendVerifyAction} className="note note-warn">
              <span className="mr-3">E-posta adresiniz ({info.user.email}) henüz doğrulanmadı.</span>
              <Submit className="link">Doğrulama e-postasını yeniden gönder</Submit>
            </ActionForm>
          )}
        </div>
        <main id="icerik" className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
