import Link from "next/link";
import { verifyEmailAction } from "@/app/actions";
import { ActionForm, Submit } from "@/ui/Form";

export const metadata = { title: "E-posta doğrulama" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <>
      <h1 className="text-[2.2rem]">E-posta doğrulama</h1>
      {t ? (
        <ActionForm action={verifyEmailAction.bind(null, t)} className="mt-5">
          <p className="mb-5 text-ink-2">Hesabınızı etkinleştirmek için adresinizi doğrulayın.</p>
          <Submit>E-postamı doğrula</Submit>
        </ActionForm>
      ) : (
        <p role="alert" className="note note-danger mt-5">Doğrulama bağlantısı eksik. E-postadaki bağlantıyı yeniden açın.</p>
      )}
      <p className="mt-6"><Link className="link" href="/panel">Panele git</Link></p>
    </>
  );
}
