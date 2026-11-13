import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { getSession } from "@/server/session";

export const metadata = { title: "Firma bulunamadı" };

export default async function NoOrgPage() {
  const { info } = await getSession();
  if (!info) redirect("/giris");
  if (info.org) redirect("/panel");
  return (
    <>
      <h1 className="text-[2.2rem]">Bir firmaya bağlı değilsiniz</h1>
      <p className="mt-3 text-ink-2">{info.user.email} hesabı şu anda hiçbir firmanın ekibinde değil. Bir ekibe katılmak için firma yöneticisinden davet isteyin.</p>
      <form action={logoutAction} className="mt-6"><button className="btn btn-secondary">Çıkış yap</button></form>
    </>
  );
}
