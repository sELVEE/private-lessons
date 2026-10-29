CREATE TABLE "lesson_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"tutor_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"content_enc" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_notes_lesson_id_unique" UNIQUE("lesson_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"tutor_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"covered" text DEFAULT '' NOT NULL,
	"next_steps" text DEFAULT '' NOT NULL,
	"engagement" smallint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_reports_lesson_id_unique" UNIQUE("lesson_id")
);
--> statement-breakpoint
CREATE TABLE "note_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"content_enc" text NOT NULL,
	"edited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_reports" ADD CONSTRAINT "lesson_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_reports" ADD CONSTRAINT "lesson_reports_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_reports" ADD CONSTRAINT "lesson_reports_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_reports" ADD CONSTRAINT "lesson_reports_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_reports" ADD CONSTRAINT "lesson_reports_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_revisions" ADD CONSTRAINT "note_revisions_note_id_lesson_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."lesson_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_revisions" ADD CONSTRAINT "note_revisions_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_reports_enrollment_idx" ON "lesson_reports" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "note_revisions_note_idx" ON "note_revisions" USING btree ("note_id","created_at");--> statement-breakpoint
-- Notes: tutor and student of the lesson only (no parents, no org owner).
GRANT SELECT, INSERT, UPDATE ON lesson_notes TO pl_app;--> statement-breakpoint
ALTER TABLE lesson_notes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY lesson_notes_parties ON lesson_notes FOR ALL TO pl_app
  USING (tutor_id = app_uid() OR student_id = app_uid())
  WITH CHECK ((tutor_id = app_uid() OR student_id = app_uid()) AND app_enrollment_matches(enrollment_id, tutor_id, student_id));--> statement-breakpoint
GRANT SELECT, INSERT ON note_revisions TO pl_app;--> statement-breakpoint
ALTER TABLE note_revisions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY note_revisions_read ON note_revisions FOR SELECT TO pl_app
  USING (EXISTS (SELECT 1 FROM lesson_notes n WHERE n.id = note_id));--> statement-breakpoint
CREATE POLICY note_revisions_write ON note_revisions FOR INSERT TO pl_app
  WITH CHECK (edited_by = app_uid() AND EXISTS (SELECT 1 FROM lesson_notes n WHERE n.id = note_id));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON lesson_reports TO pl_app;--> statement-breakpoint
ALTER TABLE lesson_reports ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY lesson_reports_read ON lesson_reports FOR SELECT TO pl_app USING (tutor_id = app_uid() OR student_id = app_uid() OR app_parent_of(student_id) OR app_has_org_role(organization_id, '{owner}'));--> statement-breakpoint
CREATE POLICY lesson_reports_tutor ON lesson_reports FOR ALL TO pl_app
  USING (tutor_id = app_uid())
  WITH CHECK (tutor_id = app_uid() AND app_enrollment_matches(enrollment_id, tutor_id, student_id));
