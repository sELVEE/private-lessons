ALTER TABLE "org_settings" ADD COLUMN "slot_minutes" smallint DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE org_settings ADD CONSTRAINT org_settings_slot_minutes CHECK (slot_minutes IN (5, 10, 15, 20, 30, 60));
