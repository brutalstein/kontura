import { boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";
import type { Analysis, LineResult, Rules } from "@/engine";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

export type Role = "owner" | "admin" | "estimator" | "viewer";
export type Currency = "TRY" | "USD" | "EUR";
export type Company = { taxOffice?: string; taxNo?: string; address?: string; phone?: string; email?: string };
export type OrgRules = Rules & { validityDays: number; fx: { USD: number; EUR: number } };
export type Contact = { name: string; email: string; phone?: string; company?: string };
export type QuoteTotals =
  | { ok: true; subtotal: number; minOrderAdjustment: number; net: number; vat: number; gross: number;
      stocks: { stockKey: string; label: string; sheetCount: number; billableWeightKg: number; utilization: number; estimated: boolean }[] }
  | { ok: false; error: string };
export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected";
export type OrderStatus = "new" | "cutting" | "finishing" | "ready" | "delivered";
export const OP_UNITS = ["adet", "m2", "m", "dk"] as const;
export type OpUnit = (typeof OP_UNITS)[number];
/** A catalogue operation applied to a quote line. `qty` is per part, in the operation's unit. Name and unit are copied so a sent quote keeps its scope text. */
export type ItemOp = { opId: string; name: string; unit: OpUnit; qty: number };
export type PartRecipe = { materialId: string | null; machineId: string | null; thickness: number | null; qty: number; bends: number; extraPerUnit: number; ops?: ItemOp[]; customerMaterial?: boolean };
export type PartBaseline = { qty: number; result: LineResult; quoteNumber: number; savedAt: string };
export type QuantityOption = { id: string; label: string; quantities: Record<string, number>; totals: QuoteTotals; lines: LineResult[] };

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: ts("email_verified_at"),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  createdAt: createdAt(),
});

export const orgs = pgTable("orgs", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  company: jsonb("company").$type<Company>().notNull().default({}),
  rules: jsonb("rules").$type<OrgRules>().notNull(),
  portalEnabled: boolean("portal_enabled").notNull().default(false),
  portalShowPrice: boolean("portal_show_price").notNull().default(true),
  plan: text("plan").$type<"trial" | "starter" | "workshop" | "pro">().notNull().default("trial"),
  trialEndsAt: ts("trial_ends_at").notNull(),
  subStatus: text("sub_status").$type<"none" | "active" | "past_due" | "canceled">().notNull().default("none"),
  subRef: text("sub_ref"),
  subRenewsAt: ts("sub_renews_at"),
  onboardedAt: ts("onboarded_at"),
  createdAt: createdAt(),
});

export const memberships = pgTable("memberships", {
  orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").$type<Role>().notNull(),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.orgId, t.userId] })]);

/** Session and one-time token ids are SHA-256 hashes; the raw value only ever lives in the cookie or the e-mailed link. */
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: text("org_id").references(() => orgs.id, { onDelete: "set null" }),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
});

export const tokens = pgTable("tokens", {
  id: text("id").primaryKey(),
  kind: text("kind").$type<"verify" | "reset" | "invite">().notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  orgId: text("org_id").references(() => orgs.id, { onDelete: "cascade" }),
  email: text("email"),
  role: text("role").$type<Role>(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

export const machines = pgTable("machines", {
  id: id(),
  orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").$type<"laser" | "plasma" | "waterjet" | "oxyfuel">().notNull().default("laser"),
  ratePerMin: doublePrecision("rate_per_min").notNull(),
  createdAt: createdAt(),
}, (t) => [index("machines_org").on(t.orgId)]);

export const materials = pgTable("materials", {
  id: id(),
  orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  densityGcm3: doublePrecision("density_gcm3").notNull(),
  pricePerKg: doublePrecision("price_per_kg").notNull(),
  currency: text("currency").$type<Currency>().notNull().default("TRY"),
  sheetW: doublePrecision("sheet_w").notNull(),
  sheetH: doublePrecision("sheet_h").notNull(),
  createdAt: createdAt(),
}, (t) => [index("materials_org").on(t.orgId)]);

export const cutParams = pgTable("cut_params", {
  id: id(),
  orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  machineId: text("machine_id").notNull().references(() => machines.id, { onDelete: "cascade" }),
  materialId: text("material_id").notNull().references(() => materials.id, { onDelete: "cascade" }),
  thickness: doublePrecision("thickness").notNull(),
  feedMmMin: doublePrecision("feed_mm_min").notNull(),
  pierceSec: doublePrecision("pierce_sec").notNull(),
}, (t) => [unique("cut_params_row").on(t.machineId, t.materialId, t.thickness), index("cut_params_org").on(t.orgId)]);

/** Named extra operations a shop sells (deburring, tapping, coating...). Price is per unit, setupFee once per quote line. */
export const operations = pgTable("operations", {
  id: id(),
  orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  unit: text("unit").$type<OpUnit>().notNull().default("adet"),
  price: doublePrecision("price").notNull(),
  setupFee: doublePrecision("setup_fee").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [index("operations_org").on(t.orgId)]);

export const customers = pgTable("customers", {
  id: id(),
  orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  taxNo: text("tax_no"),
  note: text("note"),
  createdAt: createdAt(),
}, (t) => [index("customers_org").on(t.orgId)]);

export const files = pgTable("files", {
  id: id(),
  orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  size: integer("size").notNull(),
  content: text("content").notNull(),
  createdAt: createdAt(),
}, (t) => [index("files_org").on(t.orgId)]);

export const quotes = pgTable("quotes", {
  id: id(),
  orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
  contact: jsonb("contact").$type<Contact>(),
  status: text("status").$type<QuoteStatus>().notNull().default("draft"),
  source: text("source").$type<"panel" | "portal">().notNull().default("panel"),
  publicToken: text("public_token").notNull().unique(),
  notes: text("notes"),
  validUntil: ts("valid_until"),
  totals: jsonb("totals").$type<QuoteTotals>(),
  options: jsonb("options").$type<QuantityOption[]>().notNull().default([]),
  selectedOptionId: text("selected_option_id"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  sentAt: ts("sent_at"),
  decidedAt: ts("decided_at"),
  createdAt: createdAt(),
}, (t) => [unique("quotes_org_number").on(t.orgId, t.number), index("quotes_org_created").on(t.orgId, t.createdAt)]);

export const quoteItems = pgTable("quote_items", {
  id: id(),
  quoteId: text("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  fileId: text("file_id").references(() => files.id, { onDelete: "set null" }),
  partCode: text("part_code").notNull().default(""),
  revision: text("revision").notNull().default(""),
  baseline: jsonb("baseline").$type<PartBaseline>(),
  analysis: jsonb("analysis").$type<Analysis>().notNull(),
  materialId: text("material_id").references(() => materials.id, { onDelete: "set null" }),
  machineId: text("machine_id").references(() => machines.id, { onDelete: "set null" }),
  thickness: doublePrecision("thickness"),
  qty: integer("qty").notNull().default(1),
  bends: integer("bends").notNull().default(0),
  extraPerUnit: doublePrecision("extra_per_unit").notNull().default(0),
  ops: jsonb("ops").$type<ItemOp[]>().notNull().default([]),
  customerMaterial: boolean("customer_material").notNull().default(false),
  result: jsonb("result").$type<LineResult>(),
  position: integer("position").notNull().default(0),
}, (t) => [index("quote_items_quote").on(t.quoteId)]);

/** Immutable, customer-scoped drawing and recipe. Independent of the original quote/files. */
export const partRevisions = pgTable("part_revisions", {
  id: id(),
  orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  revision: text("revision").notNull(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(),
  analysis: jsonb("analysis").$type<Analysis>().notNull(),
  recipe: jsonb("recipe").$type<PartRecipe>().notNull(),
  baseline: jsonb("baseline").$type<PartBaseline>().notNull(),
  createdAt: createdAt(),
}, (t) => [unique("part_revision_identity").on(t.orgId, t.customerId, t.code, t.revision), index("part_revisions_org_customer").on(t.orgId, t.customerId)]);

export const orders = pgTable("orders", {
  id: id(),
  orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  quoteId: text("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }).unique(),
  status: text("status").$type<OrderStatus>().notNull().default("new"),
  dueDate: ts("due_date"),
  note: text("note"),
  createdAt: createdAt(),
}, (t) => [index("orders_org").on(t.orgId)]);

/** Provider webhook events, keyed by the provider's own reference so redelivery is idempotent. */
export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(),
  orgId: text("org_id").references(() => orgs.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: createdAt(),
});

export const supportMessages = pgTable("support_messages", {
  id: id(),
  orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export const auditLog = pgTable("audit_log", {
  id: id(),
  orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  userId: text("user_id"),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: createdAt(),
}, (t) => [index("audit_org_created").on(t.orgId, t.createdAt)]);
