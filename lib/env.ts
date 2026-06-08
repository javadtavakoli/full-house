import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  // Optional — historically used as the single deployment-wide workspace.
  // The app is now workspace-agnostic: each user supplies their workspace URL at signup.
  // This stays only as a fallback for legacy oauth_accounts rows where workspace_base_url is null.
  YT_BASE_URL: z.string().url().optional(),
  YT_TOKEN_ENC_KEY: z.string().refine(
    (v) => Buffer.from(v, "base64").length === 32,
    "must be a base64-encoded 32-byte key",
  ),
  YT_SP_FIELD: z.string().optional().transform((s) => s?.trim() || undefined),
  YT_DURATION_FIELD: z.string().optional().transform((s) => s?.trim() || undefined),
  YT_DONE_STATE_NAMES: z.string().optional().transform((s) =>
    s ? s.split(",").map((x) => x.trim()).filter(Boolean) : [],
  ),
  PUSHER_APP_ID: z.string().min(1),
  PUSHER_KEY: z.string().min(1),
  PUSHER_SECRET: z.string().min(1),
  PUSHER_CLUSTER: z.string().min(1),
  NEXT_PUBLIC_PUSHER_KEY: z.string().min(1),
  NEXT_PUBLIC_PUSHER_CLUSTER: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid env: ${issues}`);
}

export const env = parsed.data;
