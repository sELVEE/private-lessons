CREATE TABLE "availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tutor_id" uuid NOT NULL,
	"weekday" smallint,
	"on_date" date,
	"start_min" smallint,
	"end_min" smallint,
	"note" text,
	CONSTRAINT "availability_kind" CHECK (("availability"."weekday" IS NULL) <> ("availability"."on_date" IS NULL)),
	CONSTRAINT "availability_range" CHECK (("availability"."start_min" IS NULL AND "availability"."end_min" IS NULL AND "availability"."on_date" IS NOT NULL) OR ("availability"."start_min" >= 0 AND "availability"."end_min" <= 1440 AND "availability"."end_min" > "availability"."start_min"))
);
--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_tutor_idx" ON "availability" USING btree ("tutor_id");--> statement-breakpoint
ALTER TABLE availability ADD CONSTRAINT availability_weekday CHECK (weekday IS NULL OR weekday BETWEEN 0 AND 6);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON availability TO pl_app;--> statement-breakpoint
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Godziny pracy widzi i zmienia tylko ich właściciel (korepetytor).
CREATE POLICY availability_own ON availability FOR ALL TO pl_app
  USING (tutor_id = app_uid())
  WITH CHECK (tutor_id = app_uid() AND app_has_org_role(organization_id, '{owner,tutor}'));
