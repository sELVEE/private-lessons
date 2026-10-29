CREATE TYPE "public"."assessment_kind" AS ENUM('test', 'quiz', 'exam', 'oral', 'homework', 'other');--> statement-breakpoint
CREATE TYPE "public"."topic_status" AS ENUM('learning', 'review', 'mastered');--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"tutor_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "assessment_kind" NOT NULL,
	"score" numeric(8, 2),
	"max_score" numeric(8, 2),
	"grade" text,
	"taken_at" date NOT NULL,
	"topic_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"tutor_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"title" text NOT NULL,
	"target_date" date,
	"achieved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"tutor_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"status" "topic_status" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_goals" ADD CONSTRAINT "learning_goals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_goals" ADD CONSTRAINT "learning_goals_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_goals" ADD CONSTRAINT "learning_goals_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_goals" ADD CONSTRAINT "learning_goals_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_progress" ADD CONSTRAINT "topic_progress_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_progress" ADD CONSTRAINT "topic_progress_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_progress" ADD CONSTRAINT "topic_progress_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_progress" ADD CONSTRAINT "topic_progress_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_progress" ADD CONSTRAINT "topic_progress_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessments_enrollment_idx" ON "assessments" USING btree ("enrollment_id","taken_at");--> statement-breakpoint
CREATE INDEX "learning_goals_enrollment_idx" ON "learning_goals" USING btree ("enrollment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_progress_uq" ON "topic_progress" USING btree ("enrollment_id","topic_id");--> statement-breakpoint
-- Progress: tutor writes, student and linked parents read.
GRANT SELECT, INSERT, UPDATE, DELETE ON assessments TO pl_app;--> statement-breakpoint
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY assessments_read ON assessments FOR SELECT TO pl_app USING (tutor_id = app_uid() OR student_id = app_uid() OR app_parent_of(student_id) OR app_has_org_role(organization_id, '{owner}'));--> statement-breakpoint
CREATE POLICY assessments_tutor ON assessments FOR ALL TO pl_app
  USING (tutor_id = app_uid())
  WITH CHECK (tutor_id = app_uid() AND app_enrollment_matches(enrollment_id, tutor_id, student_id));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON topic_progress TO pl_app;--> statement-breakpoint
ALTER TABLE topic_progress ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY topic_progress_read ON topic_progress FOR SELECT TO pl_app USING (tutor_id = app_uid() OR student_id = app_uid() OR app_parent_of(student_id) OR app_has_org_role(organization_id, '{owner}'));--> statement-breakpoint
CREATE POLICY topic_progress_tutor ON topic_progress FOR ALL TO pl_app
  USING (tutor_id = app_uid())
  WITH CHECK (tutor_id = app_uid() AND app_enrollment_matches(enrollment_id, tutor_id, student_id));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_goals TO pl_app;--> statement-breakpoint
ALTER TABLE learning_goals ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY learning_goals_read ON learning_goals FOR SELECT TO pl_app USING (tutor_id = app_uid() OR student_id = app_uid() OR app_parent_of(student_id) OR app_has_org_role(organization_id, '{owner}'));--> statement-breakpoint
CREATE POLICY learning_goals_tutor ON learning_goals FOR ALL TO pl_app
  USING (tutor_id = app_uid())
  WITH CHECK (tutor_id = app_uid() AND app_enrollment_matches(enrollment_id, tutor_id, student_id));
