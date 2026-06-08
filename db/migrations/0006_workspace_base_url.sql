ALTER TABLE "oauth_accounts" ADD COLUMN "workspace_base_url" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "workspace_base_url" text DEFAULT '' NOT NULL;