ALTER TABLE "oauth_accounts" ADD COLUMN "encryption_mode" text DEFAULT 'server' NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD COLUMN "password_salt" text;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD COLUMN "pbkdf2_iterations" integer DEFAULT 600000 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "youtrack_login" text;