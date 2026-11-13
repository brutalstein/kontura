import { TabLink } from "@/ui/client";

const TABS = [["firma", "Firma"], ["makineler", "Makineler"], ["malzemeler", "Malzemeler"], ["islemler", "İşlemler"], ["fiyatlandirma", "Fiyatlandırma"], ["ekip", "Ekip"], ["portal", "Müşteri portalı"], ["abonelik", "Abonelik"], ["hesap", "Hesabım"]];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="text-[2rem]">Ayarlar</h1>
      <nav aria-label="Ayar bölümleri" className="mb-7 mt-4 flex gap-5 overflow-x-auto border-b border-line">
        {TABS.map(([slug, label]) => <TabLink key={slug} href={`/panel/ayarlar/${slug}`}>{label}</TabLink>)}
      </nav>
      {children}
    </>
  );
}
