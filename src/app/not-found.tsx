import Link from "next/link";
import { Logo } from "@/ui/bits";

export default function NotFound() {
  return (
    <main id="icerik" className="mx-auto grid min-h-[100dvh] max-w-[34rem] content-center px-5">
      <Logo />
      <h1 className="mt-8 text-[2.2rem]">Sayfa bulunamadı</h1>
      <p className="mt-3 text-ink-2">Aradığınız sayfa taşınmış ya da hiç var olmamış olabilir. Bağlantıyı kontrol edin.</p>
      <div className="mt-6 flex gap-3">
        <Link className="btn btn-primary" href="/panel">Panele git</Link>
        <Link className="btn btn-secondary" href="/">Ana sayfa</Link>
      </div>
    </main>
  );
}
