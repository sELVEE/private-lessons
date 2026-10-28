CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'paused', 'ended');--> statement-breakpoint
CREATE TABLE "enrollment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"actor_id" uuid,
	"type" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tutor_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"goals" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tutor_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"email_hash" text,
	"max_uses" smallint DEFAULT 1 NOT NULL,
	"uses" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "parent_link_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parent_link_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "parent_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enrollment_events" ADD CONSTRAINT "enrollment_events_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_events" ADD CONSTRAINT "enrollment_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_link_codes" ADD CONSTRAINT "parent_link_codes_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_parent_id_topics_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enrollment_events_enrollment_idx" ON "enrollment_events" USING btree ("enrollment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_tutor_student_subject_uq" ON "enrollments" USING btree ("tutor_id","student_id","subject_id");--> statement-breakpoint
CREATE INDEX "enrollments_student_idx" ON "enrollments" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "invites_tutor_idx" ON "invites" USING btree ("tutor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parent_links_parent_student_uq" ON "parent_links" USING btree ("parent_id","student_id");--> statement-breakpoint
CREATE INDEX "parent_links_student_idx" ON "parent_links" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_org_name_uq" ON "subjects" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "topics_subject_idx" ON "topics" USING btree ("subject_id");--> statement-breakpoint
-- ============================================================================================
-- Row-level security for teaching data.
-- The API runs domain queries as the NOLOGIN role `pl_app` (SET LOCAL ROLE inside a transaction)
-- with the acting user in `app.user_id`. Even a query without a WHERE clause only sees rows that
-- user may see. The migration owner (used for auth tables and migrations) is not affected.
-- ============================================================================================
DO $$ BEGIN
  CREATE ROLE pl_app NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
GRANT pl_app TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO pl_app;--> statement-breakpoint

-- Read-only access to the identity tables it needs for joins (no password hashes, no MFA secrets).
GRANT SELECT (id, username, email, display_name, account_type, status) ON users TO pl_app;--> statement-breakpoint
GRANT SELECT ON student_profiles, organizations, memberships TO pl_app;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON subjects, topics, parent_links, parent_link_codes TO pl_app;--> statement-breakpoint
GRANT SELECT, INSERT ON enrollments, enrollment_events TO pl_app;--> statement-breakpoint
GRANT UPDATE (status, goals, ended_at) ON enrollments TO pl_app;--> statement-breakpoint
GRANT SELECT, INSERT ON invites TO pl_app;--> statement-breakpoint
GRANT UPDATE (uses, revoked_at) ON invites TO pl_app;--> statement-breakpoint

CREATE FUNCTION app_uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;--> statement-breakpoint

CREATE FUNCTION app_setting(name text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting(name, true), '')
$$;--> statement-breakpoint

-- SECURITY DEFINER helpers read membership tables without recursing into policies.
CREATE FUNCTION app_has_org_role(org uuid, roles org_role[]) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = org AND m.user_id = app_uid() AND m.role = ANY (roles)
  )
$$;--> statement-breakpoint

CREATE FUNCTION app_parent_of(student uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM parent_links p WHERE p.parent_id = app_uid() AND p.student_id = student)
$$;--> statement-breakpoint

-- Members of the organization, plus parents of its students, may read its subjects and topics.
CREATE FUNCTION app_can_see_org(org uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = org AND m.user_id = app_uid())
      OR EXISTS (
        SELECT 1 FROM memberships m JOIN parent_links p ON p.student_id = m.user_id
        WHERE m.organization_id = org AND p.parent_id = app_uid()
      )
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION app_has_org_role(uuid, org_role[]), app_parent_of(uuid), app_can_see_org(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_has_org_role(uuid, org_role[]), app_parent_of(uuid), app_can_see_org(uuid) TO pl_app;--> statement-breakpoint

ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY subjects_read ON subjects FOR SELECT TO pl_app USING (app_can_see_org(organization_id));--> statement-breakpoint
CREATE POLICY subjects_write ON subjects FOR ALL TO pl_app
  USING (app_has_org_role(organization_id, '{owner,tutor}'))
  WITH CHECK (app_has_org_role(organization_id, '{owner,tutor}'));--> statement-breakpoint

ALTER TABLE topics ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY topics_read ON topics FOR SELECT TO pl_app USING (app_can_see_org(organization_id));--> statement-breakpoint
CREATE POLICY topics_write ON topics FOR ALL TO pl_app
  USING (app_has_org_role(organization_id, '{owner,tutor}'))
  WITH CHECK (app_has_org_role(organization_id, '{owner,tutor}'));--> statement-breakpoint

-- A tutor manages their own invites. Anyone holding the code (hash in app.invite_code_hash)
-- may read that single invite and count a use when joining.
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY invites_owner ON invites FOR ALL TO pl_app
  USING (tutor_id = app_uid() AND app_has_org_role(organization_id, '{owner,tutor}'))
  WITH CHECK (tutor_id = app_uid() AND app_has_org_role(organization_id, '{owner,tutor}'));--> statement-breakpoint
CREATE POLICY invites_by_code_read ON invites FOR SELECT TO pl_app
  USING (code_hash = app_setting('app.invite_code_hash'));--> statement-breakpoint
CREATE POLICY invites_by_code_use ON invites FOR UPDATE TO pl_app
  USING (code_hash = app_setting('app.invite_code_hash'))
  WITH CHECK (code_hash = app_setting('app.invite_code_hash'));--> statement-breakpoint

-- Enrollments: the tutor, the student, the student's parents and the organization owner see a row.
-- Other tutors — even in the same organization — do not.
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY enrollments_read ON enrollments FOR SELECT TO pl_app
  USING (
    tutor_id = app_uid() OR student_id = app_uid() OR app_parent_of(student_id)
    OR app_has_org_role(organization_id, '{owner}')
  );--> statement-breakpoint
CREATE POLICY enrollments_tutor_write ON enrollments FOR ALL TO pl_app
  USING (tutor_id = app_uid())
  WITH CHECK (tutor_id = app_uid() AND app_has_org_role(organization_id, '{owner,tutor}'));--> statement-breakpoint
-- A student creates or reactivates their enrollment only with a valid invite from that tutor.
CREATE POLICY enrollments_join ON enrollments FOR ALL TO pl_app
  USING (student_id = app_uid())
  WITH CHECK (
    student_id = app_uid() AND EXISTS (
      SELECT 1 FROM invites i
      WHERE i.code_hash = app_setting('app.invite_code_hash')
        AND i.tutor_id = enrollments.tutor_id
        AND i.subject_id = enrollments.subject_id
        AND i.organization_id = enrollments.organization_id
    )
  );--> statement-breakpoint

ALTER TABLE enrollment_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY enrollment_events_read ON enrollment_events FOR SELECT TO pl_app
  USING (EXISTS (SELECT 1 FROM enrollments e WHERE e.id = enrollment_id));--> statement-breakpoint
CREATE POLICY enrollment_events_write ON enrollment_events FOR INSERT TO pl_app
  WITH CHECK (
    actor_id = app_uid() AND EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.id = enrollment_id AND (e.tutor_id = app_uid() OR e.student_id = app_uid())
    )
  );--> statement-breakpoint

-- Parent linking: the student owns their codes; a parent holding a code may consume it.
ALTER TABLE parent_link_codes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY parent_link_codes_owner ON parent_link_codes FOR ALL TO pl_app
  USING (student_id = app_uid()) WITH CHECK (student_id = app_uid());--> statement-breakpoint
CREATE POLICY parent_link_codes_redeem ON parent_link_codes FOR SELECT TO pl_app
  USING (code_hash = app_setting('app.link_code_hash'));--> statement-breakpoint
CREATE POLICY parent_link_codes_consume ON parent_link_codes FOR DELETE TO pl_app
  USING (code_hash = app_setting('app.link_code_hash'));--> statement-breakpoint

ALTER TABLE parent_links ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY parent_links_read ON parent_links FOR SELECT TO pl_app
  USING (parent_id = app_uid() OR student_id = app_uid());--> statement-breakpoint
CREATE POLICY parent_links_remove ON parent_links FOR DELETE TO pl_app
  USING (parent_id = app_uid() OR student_id = app_uid());--> statement-breakpoint
CREATE POLICY parent_links_create ON parent_links FOR INSERT TO pl_app
  WITH CHECK (
    parent_id = app_uid() AND EXISTS (
      SELECT 1 FROM parent_link_codes c
      WHERE c.code_hash = app_setting('app.link_code_hash')
        AND c.student_id = parent_links.student_id
        AND c.expires_at > now()
    )
  );
