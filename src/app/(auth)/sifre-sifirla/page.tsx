import Link from "next/link";
import { forgotAction, resetAction } from "@/app/actions";
import { Field } from "@/ui/bits";
import { ActionForm, Submit } from "@/ui/Form";

export const metadata = { title: "Şifre sıfırlama" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return t ? (
    <>
      <h1 className="text-[2.2rem]">Yeni şifre belirleyin</h1>
      <p className="mt-2 text-ink-2">Kaydettiğinizde açık olan tüm oturumlarınız kapatılır.</p>
      <ActionForm action={resetAction.bind(null, t)} className="mt-7 grid gap-4">
        <Field label="Yeni şifre" name="password" type="password" autoComplete="new-password" required minLength={10} hint="En az 10 karakter." />
        <div><Submit>Şifreyi kaydet</Submit></div>
      </ActionForm>
    </>
  ) : (
    <>
      <h1 className="text-[2.2rem]">Şifrenizi mi unuttunuz?</h1>
      <p className="mt-2 text-ink-2">E-posta adresinizi yazın, bir saat geçerli sıfırlama bağlantısı gönderelim.</p>
      <ActionForm action={forgotAction} className="mt-7 grid gap-4">
        <Field label="E-posta" name="email" type="email" autoComplete="email" required />
        <div className="flex items-center justify-between gap-3">
          <Submit>Bağlantı gönder</Submit>
          <Link className="link text-[0.9rem]" href="/giris">Girişe dön</Link>
        </div>
      </ActionForm>
    </>
  );
}
