ALTER TABLE "issues" ADD COLUMN "phases" jsonb;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "phase_index" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "default_phases" jsonb;--> statement-breakpoint
-- Backward-compat: remap in-flight issue rows from the old encoded status strings
-- to the new {status, phase_index} model. Terminal rows (completed/skipped/pending)
-- keep their status and derive phases lazily; only voting/revealed rows need an index.
UPDATE "issues" SET "status" = 'voting',   "phase_index" = -1 WHERE "status" = 'sp_voting';
UPDATE "issues" SET "status" = 'revealed', "phase_index" = -1 WHERE "status" = 'sp_revealed';
UPDATE "issues" SET "status" = 'voting',   "phase_index" = 0  WHERE "status" = 'dur_impl_voting';
UPDATE "issues" SET "status" = 'revealed', "phase_index" = 0  WHERE "status" = 'dur_impl_revealed';
UPDATE "issues" SET "status" = 'voting',   "phase_index" = 1  WHERE "status" = 'dur_review_voting';
UPDATE "issues" SET "status" = 'revealed', "phase_index" = 1  WHERE "status" = 'dur_review_revealed';
UPDATE "issues" SET "status" = 'voting',   "phase_index" = 2  WHERE "status" = 'dur_test_voting';
UPDATE "issues" SET "status" = 'revealed', "phase_index" = 2  WHERE "status" = 'dur_test_revealed';