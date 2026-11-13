import Link from "next/link";
import { Logo } from "@/ui/bits";
import { ThemeToggle } from "@/ui/client";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const mail = process.env.SUPPORT_EMAIL;
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-bg">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-2 px-3 sm:gap-4 sm:px-8">
          <Logo />
          <nav aria-label="Site menüsü" className="flex items-center gap-0.5 sm:gap-2">
            <Link href="/#ozellikler" className="btn btn-ghost btn-sm hidden md:inline-flex">Özellikler</Link>
            <Link href="/fiyatlar" className="btn btn-ghost btn-sm hidden sm:inline-flex">Fiyatlar</Link>
            <Link href="/giris" className="btn btn-ghost btn-sm">Giriş</Link>
            <ThemeToggle />
            <Link href="/kayit" className="btn btn-primary btn-sm">Ücretsiz deneyin</Link>
          </nav>
        </div>
      </header>
      <main id="icerik" className="flex-1">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-10 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:px-8">
          <div>
            <Logo />
            <p className="mt-3 max-w-[38ch] text-[0.9rem] text-ink-2">Fason lazer ve plazma kesim atölyeleri için DXF&apos;ten teklif yazılımı.</p>
          </div>
          <nav aria-label="Ürün" className="grid content-start gap-2 text-[0.9rem]">
            <Link className="hover:underline" href="/#ozellikler">Özellikler</Link>
            <Link className="hover:underline" href="/fiyatlar">Fiyatlar</Link>
            <a className="hover:underline" href="/ornek.dxf" download>Örnek DXF</a>
            {mail && <a className="hover:underline" href={`mailto:${mail}`}>{mail}</a>}
          </nav>
          <nav aria-label="Yasal" className="grid content-start gap-2 text-[0.9rem]">
            <Link className="hover:underline" href="/yasal/kosullar">Kullanım koşulları</Link>
            <Link className="hover:underline" href="/yasal/gizlilik">Gizlilik ve çerezler</Link>
            <Link className="hover:underline" href="/yasal/kvkk">KVKK aydınlatma metni</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
