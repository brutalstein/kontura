"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="icerik" className="mx-auto grid min-h-[70dvh] max-w-[34rem] content-center px-5">
      <h1 className="text-[2.2rem]">Bir şeyler ters gitti</h1>
      <p className="mt-3 text-ink-2">İsteğiniz tamamlanamadı. Verileriniz güvende; sayfayı yeniden deneyin. Sorun sürerse destek ekibine aşağıdaki kodu iletin.</p>
      {error.digest && <p className="num mt-3 text-[0.85rem] text-ink-3">Hata kodu: {error.digest}</p>}
      <div className="mt-6 flex gap-3">
        <button className="btn btn-primary" onClick={reset}>Yeniden dene</button>
        <Link className="btn btn-secondary" href="/">Ana sayfa</Link>
      </div>
    </main>
  );
}
