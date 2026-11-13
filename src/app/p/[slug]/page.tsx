import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db";
import { getPortal } from "@/server/quotes";
import { ThemeToggle } from "@/ui/client";
import { PortalClient } from "@/ui/Portal";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const portal = await getPortal(await getDb(), (await params).slug);
  return portal ? { title: `${portal.name} | Anında lazer kesim teklifi`, description: `${portal.name} için DXF yükleyin, malzeme ve adet seçin, teklif isteyin.` } : { title: "Portal bulunamadı" };
}

export default async function PortalPage({ params }: { params: Promise<{ slug: string }> }) {
  const portal = await getPortal(await getDb(), (await params).slug);
  if (!portal) notFound();
  const c = portal.company;
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[64rem] flex-col px-4 py-6 sm:px-8">
      <header className="flex items-center justify-between gap-4 border-b border-line pb-5">
        <p className="font-display text-[1.7rem] font-bold leading-none">{portal.name}</p>
        <ThemeToggle />
      </header>
      <main id="icerik" className="flex-1 py-8">
        <h1 className="text-[2.2rem] sm:text-[2.6rem]">Çiziminizi yükleyin, teklifinizi alın</h1>
        <p className="mb-8 mt-3 max-w-[60ch] text-ink-2">
          DXF dosyanızı ekleyin, malzemeyi ve adedi seçin. {portal.showPrice ? "Tahmini fiyatı hemen görür, talebinizi tek adımda iletirsiniz." : "Parça analizini hemen görür, talebinizi tek adımda iletirsiniz."}
        </p>
        {portal.materials.length ? (
          <PortalClient slug={portal.slug} shop={portal.name} showPrice={portal.showPrice} materials={portal.materials} />
        ) : (
          <p className="note note-warn">{portal.name} henüz malzeme ve kesim tablosu tanımlamadı. Teklif için firmayla doğrudan iletişime geçin.</p>
        )}
      </main>
      <footer className="flex flex-wrap justify-between gap-3 border-t border-line pt-5 text-[0.84rem] text-ink-3">
        <p>{[c.phone, c.email, c.address].filter(Boolean).join(", ")}</p>
        <p>Altyapı: <Link className="link" href="/">Kontura</Link></p>
      </footer>
    </div>
  );
}
