import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions";
import { getSession } from "@/server/session";
import { Field } from "@/ui/bits";
import { ActionForm, Submit } from "@/ui/Form";

export const metadata = { title: "Giriş" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ durum?: string }> }) {
  if ((await getSession()).info) redirect("/panel");
  const { durum } = await searchParams;
  return (
    <>
      <h1 className="text-[2.2rem]">Giriş yapın</h1>
      <p className="mt-2 text-ink-2">Hesabınız yok mu? <Link className="link" href="/kayit">14 gün ücretsiz deneyin</Link></p>
      {durum === "sifre" && <p role="status" className="note note-ok mt-5">Şifreniz değiştirildi. Yeni şifrenizle giriş yapın.</p>}
      <ActionForm action={loginAction} className="mt-7 grid gap-4">
        <Field label="E-posta" name="email" type="email" autoComplete="email" required />
        <Field label="Şifre" name="password" type="password" autoComplete="current-password" required />
        <div className="flex items-center justify-between gap-3">
          <Submit>Giriş yap</Submit>
          <Link className="link text-[0.9rem]" href="/sifre-sifirla">Şifremi unuttum</Link>
        </div>
      </ActionForm>
    </>
  );
}
