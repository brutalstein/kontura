CREATE TABLE "part_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"code" text NOT NULL,
	"revision" text NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"analysis" jsonb NOT NULL,
	"recipe" jsonb NOT NULL,
	"baseline" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "part_revision_identity" UNIQUE("org_id","customer_id","code","revision")
);
--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN "part_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN "revision" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN "baseline" jsonb;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "options" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "selected_option_id" text;--> statement-breakpoint
ALTER TABLE "part_revisions" ADD CONSTRAINT "part_revisions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_revisions" ADD CONSTRAINT "part_revisions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "part_revisions_org_customer" ON "part_revisions" USING btree ("org_id","customer_id");