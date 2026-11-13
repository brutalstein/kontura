import { notFound } from "next/navigation";
import { can } from "@/server/core";
import { requireCtx } from "@/server/session";
import { Machines, Materials, Operations, Pricing } from "./catalog";
import { Account, Billing, Company, Portal, Team } from "./sections";

export const metadata = { title: "Ayarlar" };

const ADMIN_ONLY = ["firma", "makineler", "malzemeler", "islemler", "fiyatlandirma", "portal"];

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ tab: string }>; searchParams: Promise<{ odeme?: string }> }) {
  const a = await requireCtx();
  const { tab } = await params;
  if (ADMIN_ONLY.includes(tab) && !can(a.info.role, "settings")) {
    return <p className="note">Bu bölümü yalnızca firma sahibi ve yöneticiler görüntüleyip değiştirebilir.</p>;
  }
  switch (tab) {
    case "firma": return <Company {...a} />;
    case "makineler": return <Machines {...a} />;
    case "malzemeler": return <Materials {...a} />;
    case "islemler": return <Operations {...a} />;
    case "fiyatlandirma": return <Pricing {...a} />;
    case "ekip": return <Team {...a} />;
    case "portal": return <Portal {...a} />;
    case "abonelik": return <Billing {...a} result={(await searchParams).odeme} />;
    case "hesap": return <Account {...a} />;
    default: notFound();
  }
}
