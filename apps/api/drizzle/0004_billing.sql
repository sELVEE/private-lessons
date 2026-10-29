CREATE TYPE "public"."ledger_kind" AS ENUM('charge', 'payment', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'transfer', 'blik', 'other');--> statement-breakpoint
CREATE TABLE "enrollment_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"tutor_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"hourly_rate" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"tutor_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"kind" "ledger_kind" NOT NULL,
	"amount" integer NOT NULL,
	"description" text NOT NULL,
	"method" "payment_method",
	"lesson_id" uuid,
	"package_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"tutor_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"lessons_total" smallint NOT NULL,
	"lessons_used" smallint DEFAULT 0 NOT NULL,
	"price" integer NOT NULL,
	"note" text,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enrollment_rates" ADD CONSTRAINT "enrollment_rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_rates" ADD CONSTRAINT "enrollment_rates_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_rates" ADD CONSTRAINT "enrollment_rates_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_rates" ADD CONSTRAINT "enrollment_rates_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_package_id_lesson_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."lesson_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_packages" ADD CONSTRAINT "lesson_packages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_packages" ADD CONSTRAINT "lesson_packages_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_packages" ADD CONSTRAINT "lesson_packages_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_packages" ADD CONSTRAINT "lesson_packages_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "enrollment_rates_enrollment_uq" ON "enrollment_rates" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "ledger_enrollment_time_idx" ON "ledger_entries" USING btree ("enrollment_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ledger_tutor_time_idx" ON "ledger_entries" USING btree ("tutor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ledger_lesson_idx" ON "ledger_entries" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "lesson_packages_enrollment_idx" ON "lesson_packages" USING btree ("enrollment_id");--> statement-breakpoint
-- Billing: tutor manages, student and linked parents read.
GRANT SELECT, INSERT, UPDATE ON enrollment_rates TO pl_app;--> statement-breakpoint
ALTER TABLE enrollment_rates ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY enrollment_rates_read ON enrollment_rates FOR SELECT TO pl_app USING (tutor_id = app_uid() OR student_id = app_uid() OR app_parent_of(student_id) OR app_has_org_role(organization_id, '{owner}'));--> statement-breakpoint
CREATE POLICY enrollment_rates_tutor ON enrollment_rates FOR ALL TO pl_app
  USING (tutor_id = app_uid())
  WITH CHECK (tutor_id = app_uid() AND app_enrollment_matches(enrollment_id, tutor_id, student_id));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON lesson_packages TO pl_app;--> statement-breakpoint
ALTER TABLE lesson_packages ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY lesson_packages_read ON lesson_packages FOR SELECT TO pl_app USING (tutor_id = app_uid() OR student_id = app_uid() OR app_parent_of(student_id) OR app_has_org_role(organization_id, '{owner}'));--> statement-breakpoint
CREATE POLICY lesson_packages_tutor ON lesson_packages FOR ALL TO pl_app
  USING (tutor_id = app_uid())
  WITH CHECK (tutor_id = app_uid() AND app_enrollment_matches(enrollment_id, tutor_id, student_id));--> statement-breakpoint
GRANT SELECT, INSERT ON ledger_entries TO pl_app;--> statement-breakpoint
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY ledger_entries_read ON ledger_entries FOR SELECT TO pl_app USING (tutor_id = app_uid() OR student_id = app_uid() OR app_parent_of(student_id) OR app_has_org_role(organization_id, '{owner}'));--> statement-breakpoint
CREATE POLICY ledger_entries_tutor ON ledger_entries FOR ALL TO pl_app
  USING (tutor_id = app_uid())
  WITH CHECK (tutor_id = app_uid() AND app_enrollment_matches(enrollment_id, tutor_id, student_id));--> statement-breakpoint
GRANT UPDATE (voided_at) ON ledger_entries TO pl_app;
