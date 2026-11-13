import Link from "next/link";
import { acceptInviteAction } from "@/app/actions";
import { peekInvite } from "@/server/auth";
import { getDb } from "@/server/db";
import { Field } from "@/ui/bits";
import { ActionForm, Submit } from "@/ui/Form";

export const metadata = { title: "Ekip daveti" };

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const invite = t ? await peekInvite(await getDb(), t) : null;
  if (!t || !invite) {
    return (
      <>
        <h1 className="text-[2.2rem]">Davet geçersiz</h1>
        <p role="alert" className="note note-danger mt-5">Bu davet bağlantısının süresi dolmuş veya daha önce kullanılmış. Sizi davet eden kişiden yeni bir davet isteyin.</p>
        <p className="mt-6"><Link className="link" href="/giris">Girişe dön</Link></p>
      </>
    );
  }
  return (
    <>
      <h1 className="text-[2.2rem]">{invite.orgName} ekibine katılın</h1>
      <p className="mt-2 text-ink-2">
        {invite.hasAccount ? `${invite.email} adresiyle bir Kontura hesabınız var. Katılmak için şifrenizi girin.` : `${invite.email} için hesap oluşturun.`}
      </p>
      <ActionForm action={acceptInviteAction.bind(null, t)} className="mt-7 grid gap-4">
        {!invite.hasAccount && <Field label="Ad soyad" name="name" autoComplete="name" required minLength={2} />}
        <Field label="Şifre" name="password" type="password" autoComplete={invite.hasAccount ? "current-password" : "new-password"} required minLength={invite.hasAccount ? undefined : 10} hint={invite.hasAccount ? undefined : "En az 10 karakter."} />
        <div><Submit>Ekibe katıl</Submit></div>
      </ActionForm>
    </>
  );
}
