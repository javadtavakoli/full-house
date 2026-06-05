// Env shim — same as unit test setup, so lib/env.ts validates
process.env.AUTH_SECRET ??= "x".repeat(32);
process.env.DATABASE_URL ??= "postgresql://user:password@localhost:5432/test";
process.env.YT_BASE_URL ??= "https://example.youtrack.cloud";
process.env.YT_TOKEN_ENC_KEY ??= Buffer.alloc(32).toString("base64");
process.env.YT_SP_FIELD ??= "Story Points";
process.env.YT_DURATION_FIELD ??= "Estimation";
process.env.YT_DONE_STATE_NAMES ??= "Done,Won't fix";
process.env.PUSHER_APP_ID ??= "1";
process.env.PUSHER_KEY ??= "k";
process.env.PUSHER_SECRET ??= "s";
process.env.PUSHER_CLUSTER ??= "eu";
process.env.NEXT_PUBLIC_PUSHER_KEY ??= "k";
process.env.NEXT_PUBLIC_PUSHER_CLUSTER ??= "eu";
process.env.NEXT_PUBLIC_SITE_URL ??= "http://localhost:3000";
