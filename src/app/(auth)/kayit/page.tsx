import Link from "next/link";
import { redirect } from "next/navigation";
import { signupAction } from "@/app/actions";
import { getSession } from "@/server/session";
import { Field } from "@/ui/bits";
import { ActionForm, Submit } from "@/ui/Form";

export const metadata = { title: "Ücretsiz deneyin" };

export default async function SignupPage() {
  if ((await getSession()).info) redirect("/panel");
  return (
    <>
      <h1 className="text-[2.2rem]">14 gün ücretsiz deneyin</h1>
      <p className="mt-2 text-ink-2">Kart bilgisi istemiyoruz. Zaten hesabınız var mı? <Link className="link" href="/giris">Giriş yapın</Link></p>
      <ActionForm action={signupAction} className="mt-7 grid gap-4">
        <Field label="Ad soyad" name="name" autoComplete="name" required minLength={2} />
        <Field label="Firma adı" name="company" autoComplete="organization" required minLength={2} hint="Tekliflerinizde bu ad görünür. Sonradan değiştirebilirsiniz." />
        <Field label="İş e-postası" name="email" type="email" autoComplete="email" required />
        <Field label="Şifre" name="password" type="password" autoComplete="new-password" required minLength={10} hint="En az 10 karakter." />
        <label className="flex items-start gap-2.5 text-[0.9rem] text-ink-2">
          <input type="checkbox" name="terms" required className="mt-1 size-4 accent-[var(--accent)]" />
          <span><Link className="link" href="/yasal/kosullar" target="_blank">Kullanım koşullarını</Link> kabul ediyorum, <Link className="link" href="/yasal/kvkk" target="_blank">KVKK aydınlatma metnini</Link> okudum.</span>
        </label>
        <div><Submit>Hesabı oluştur</Submit></div>
      </ActionForm>
    </>
  );
}
