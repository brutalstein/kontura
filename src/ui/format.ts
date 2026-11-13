import type { OpUnit, OrderStatus, QuoteStatus } from "@/server/schema";

export const OP_UNIT: Record<OpUnit, string> = { adet: "adet", m2: "m²", m: "metre", dk: "dakika" };

const TRY = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
export const tl = (n: number) => TRY.format(n);
export const num = (n: number, digits = 0) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits }).format(n);
export const day = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" }) : "");

export const QUOTE_STATUS: Record<QuoteStatus, { label: string; cls: string }> = {
  draft: { label: "Taslak", cls: "badge" },
  sent: { label: "Gönderildi", cls: "badge badge-accent" },
  accepted: { label: "Onaylandı", cls: "badge badge-ok" },
  rejected: { label: "Reddedildi", cls: "badge badge-danger" },
};
export const ORDER_STATUS: Record<OrderStatus, string> = { new: "Yeni", cutting: "Kesimde", finishing: "Büküm / son işlem", ready: "Hazır", delivered: "Teslim edildi" };
export const MACHINE_KIND = { laser: "Lazer", plasma: "Plazma", waterjet: "Su jeti", oxyfuel: "Oksijen" } as const;
