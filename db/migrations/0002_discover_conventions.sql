ALTER TABLE "sessions" ADD COLUMN "sp_field" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "duration_field" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "done_state_names" text[];