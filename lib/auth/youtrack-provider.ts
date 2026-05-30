import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";

export type YoutrackProfile = {
  id: string;
  login: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

export function YoutrackProvider(
  options: OAuthUserConfig<YoutrackProfile> & { workspaceBaseUrl: string },
): OAuthConfig<YoutrackProfile> {
  const base = options.workspaceBaseUrl.replace(/\/$/, "");
  return {
    id: "youtrack",
    name: "YouTrack",
    type: "oauth",
    authorization: {
      url: `${base}/hub/api/rest/oauth2/auth`,
      params: { response_type: "code", scope: "YouTrack", access_type: "offline" },
    },
    token: `${base}/hub/api/rest/oauth2/token`,
    userinfo: {
      url: `${base}/hub/api/rest/users/me?fields=id,login,name,email,avatarUrl`,
    },
    profile(profile) {
      return {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        image: profile.avatarUrl ?? null,
      };
    },
    options,
  };
}
