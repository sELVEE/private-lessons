CREATE TYPE "public"."homework_status" AS ENUM('assigned', 'submitted', 'reviewed');--> statement-breakpoint
CREATE TABLE "homework" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"tutor_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"lesson_id" uuid,
	"title" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"due_at" timestamp with time zone,
	"status" "homework_status" DEFAULT 'assigned' NOT NULL,
	"submission" text,
	"submitted_at" timestamp with time zone,
	"feedback" text,
	"grade" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"tutor_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tutor_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_shares" ADD CONSTRAINT "material_shares_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_shares" ADD CONSTRAINT "material_shares_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_shares" ADD CONSTRAINT "material_shares_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_shares" ADD CONSTRAINT "material_shares_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_shares" ADD CONSTRAINT "material_shares_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "homework_enrollment_idx" ON "homework" USING btree ("enrollment_id","created_at");--> statement-breakpoint
CREATE INDEX "homework_student_idx" ON "homework" USING btree ("student_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "material_shares_uq" ON "material_shares" USING btree ("material_id","enrollment_id");--> statement-breakpoint
CREATE INDEX "material_shares_student_idx" ON "material_shares" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "materials_tutor_idx" ON "materials" USING btree ("tutor_id","subject_id");--> statement-breakpoint
-- Materials: the author manages; students (and their parents) read items shared with them.
CREATE FUNCTION app_material_shared_with_me(material uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM material_shares s
    WHERE s.material_id = material AND (s.student_id = app_uid() OR app_parent_of(s.student_id))
  )
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_material_shared_with_me(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_material_shared_with_me(uuid) TO pl_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON materials TO pl_app;--> statement-breakpoint
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY materials_read ON materials FOR SELECT TO pl_app
  USING (tutor_id = app_uid() OR app_material_shared_with_me(id));--> statement-breakpoint
CREATE POLICY materials_author ON materials FOR ALL TO pl_app
  USING (tutor_id = app_uid())
  WITH CHECK (tutor_id = app_uid() AND app_has_org_role(organization_id, '{owner,tutor}'));--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON material_shares TO pl_app;--> statement-breakpoint
ALTER TABLE material_shares ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY material_shares_read ON material_shares FOR SELECT TO pl_app USING (tutor_id = app_uid() OR student_id = app_uid() OR app_parent_of(student_id) OR app_has_org_role(organization_id, '{owner}'));--> statement-breakpoint
CREATE POLICY material_shares_tutor ON material_shares FOR ALL TO pl_app
  USING (tutor_id = app_uid())
  WITH CHECK (tutor_id = app_uid() AND app_enrollment_matches(enrollment_id, tutor_id, student_id));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON homework TO pl_app;--> statement-breakpoint
ALTER TABLE homework ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY homework_read ON homework FOR SELECT TO pl_app USING (tutor_id = app_uid() OR student_id = app_uid() OR app_parent_of(student_id) OR app_has_org_role(organization_id, '{owner}'));--> statement-breakpoint
CREATE POLICY homework_tutor ON homework FOR ALL TO pl_app
  USING (tutor_id = app_uid())
  WITH CHECK (tutor_id = app_uid() AND app_enrollment_matches(enrollment_id, tutor_id, student_id));--> statement-breakpoint
CREATE POLICY homework_student_update ON homework FOR UPDATE TO pl_app
  USING (student_id = app_uid())
  WITH CHECK (student_id = app_uid() AND app_enrollment_matches(enrollment_id, tutor_id, student_id));
