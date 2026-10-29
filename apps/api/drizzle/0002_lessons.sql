CREATE TYPE "public"."attendance" AS ENUM('present', 'late', 'absent');--> statement-breakpoint
CREATE TYPE "public"."lesson_status" AS ENUM('scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "lesson_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"actor_id" uuid,
	"type" text NOT NULL,
	"from_starts_at" timestamp with time zone,
	"to_starts_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"tutor_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"series_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_min" smallint NOT NULL,
	"status" "lesson_status" DEFAULT 'scheduled' NOT NULL,
	"attendance" "attendance",
	"location" text,
	"topic" text,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"cancelled_at" timestamp with time zone,
	"chargeable" boolean,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"auto_charge_late_cancellation" boolean DEFAULT false NOT NULL,
	"cancellation_window_hours" smallint DEFAULT 24 NOT NULL,
	"default_lesson_minutes" smallint DEFAULT 60 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_changes" ADD CONSTRAINT "lesson_changes_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_changes" ADD CONSTRAINT "lesson_changes_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_settings" ADD CONSTRAINT "org_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_changes_lesson_idx" ON "lesson_changes" USING btree ("lesson_id","created_at");--> statement-breakpoint
CREATE INDEX "lessons_tutor_time_idx" ON "lessons" USING btree ("tutor_id","starts_at");--> statement-breakpoint
CREATE INDEX "lessons_student_time_idx" ON "lessons" USING btree ("student_id","starts_at");--> statement-breakpoint
CREATE INDEX "lessons_enrollment_idx" ON "lessons" USING btree ("enrollment_id","starts_at");--> statement-breakpoint
-- Row-level security (see 0001 for the model).
CREATE FUNCTION app_enrollment_matches(enrollment uuid, tutor uuid, student uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM enrollments e WHERE e.id = enrollment AND e.tutor_id = tutor AND e.student_id = student)
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_enrollment_matches(uuid, uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_enrollment_matches(uuid, uuid, uuid) TO pl_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON lessons TO pl_app;--> statement-breakpoint
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY lessons_read ON lessons FOR SELECT TO pl_app USING (tutor_id = app_uid() OR student_id = app_uid() OR app_parent_of(student_id) OR app_has_org_role(organization_id, '{owner}'));--> statement-breakpoint
CREATE POLICY lessons_tutor ON lessons FOR ALL TO pl_app
  USING (tutor_id = app_uid())
  WITH CHECK (tutor_id = app_uid() AND app_enrollment_matches(enrollment_id, tutor_id, student_id));--> statement-breakpoint
CREATE POLICY lessons_student_update ON lessons FOR UPDATE TO pl_app
  USING (student_id = app_uid())
  WITH CHECK (student_id = app_uid() AND app_enrollment_matches(enrollment_id, tutor_id, student_id));--> statement-breakpoint
GRANT SELECT, INSERT ON lesson_changes TO pl_app;--> statement-breakpoint
ALTER TABLE lesson_changes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY lesson_changes_read ON lesson_changes FOR SELECT TO pl_app
  USING (EXISTS (SELECT 1 FROM lessons l WHERE l.id = lesson_id));--> statement-breakpoint
CREATE POLICY lesson_changes_write ON lesson_changes FOR INSERT TO pl_app
  WITH CHECK (actor_id = app_uid() AND EXISTS (
    SELECT 1 FROM lessons l WHERE l.id = lesson_id AND (l.tutor_id = app_uid() OR l.student_id = app_uid())
  ));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON org_settings TO pl_app;--> statement-breakpoint
ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY org_settings_read ON org_settings FOR SELECT TO pl_app USING (app_can_see_org(organization_id));--> statement-breakpoint
CREATE POLICY org_settings_write ON org_settings FOR ALL TO pl_app
  USING (app_has_org_role(organization_id, '{owner}'))
  WITH CHECK (app_has_org_role(organization_id, '{owner}'));
