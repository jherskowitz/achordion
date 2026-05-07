import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";

/**
 * Shape of the MusicBrainz OAuth2 userinfo response.
 * `sub` is the MB username, which doubles as the LB username.
 */
export interface MusicBrainzProfile {
  sub: string;
  metabrainz_user_id: number;
  profile: string;
  email?: string;
  email_verified?: boolean;
  gravatar?: string;
}

export default function MusicBrainz<P extends MusicBrainzProfile>(
  options: OAuthUserConfig<P>,
): OAuthConfig<P> {
  return {
    id: "musicbrainz",
    name: "MusicBrainz",
    type: "oauth",
    authorization: {
      url: "https://musicbrainz.org/oauth2/authorize",
      // `profile` for sign-in (sub = MB username). `tag` for posting
      // user tag votes via /ws/2/tag — used by the per-entity tag-
      // voting UI (artist / release-group / recording pages). Adding
      // a scope to an existing app forces all currently-authenticated
      // users to re-auth before they can vote; reads keep working
      // with the old token. New sign-ins go through both scopes
      // automatically.
      params: { scope: "profile tag" },
    },
    token: "https://musicbrainz.org/oauth2/token",
    userinfo: "https://musicbrainz.org/oauth2/userinfo",
    checks: ["state"],
    profile(profile) {
      return {
        id: String(profile.metabrainz_user_id),
        name: profile.sub,
        email: profile.email ?? null,
        image: profile.gravatar ?? null,
      };
    },
    style: {
      logo: "/musicbrainz.svg",
      bg: "#ba478f",
      text: "#fff",
    },
    options,
  };
}
