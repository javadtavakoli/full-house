import { env } from "@/lib/env";

export type YoutrackConfig = {
  baseUrl: string;
  spField: string;
  durationField: string;
  doneStateNames: string[];
  oauth: { clientId: string; clientSecret: string; redirectUri: string };
};

export function youtrackConfig(): YoutrackConfig {
  return {
    baseUrl: env.YT_BASE_URL,
    spField: env.YT_SP_FIELD,
    durationField: env.YT_DURATION_FIELD,
    doneStateNames: env.YT_DONE_STATE_NAMES,
    oauth: {
      clientId: env.YT_OAUTH_CLIENT_ID,
      clientSecret: env.YT_OAUTH_CLIENT_SECRET,
      redirectUri: env.YT_OAUTH_REDIRECT_URI,
    },
  };
}
