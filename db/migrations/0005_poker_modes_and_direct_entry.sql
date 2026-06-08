ALTER TABLE "issues" ADD COLUMN "poker_mode" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "with_estimation" boolean;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "direct_entry" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "default_poker_mode" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "default_with_estimation" boolean;