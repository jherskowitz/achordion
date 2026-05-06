"use server";

import { auth } from "@/auth";
import { getLbTokenForRequest } from "@/lib/lb-token";
import { submitThanks } from "@/lib/clients/listenbrainz";

export type ThanksResult = { ok: true } | { ok: false; reason: string };

/**
 * Server action backing `<ThanksButton>`. Looks up the viewer's LB
 * token server-side, posts to LB's
 * `/user/<thanker>/timeline-event/create/thanks` endpoint, and
 * surfaces any error message (most often "you cannot thank events of
 * this user" when the viewer doesn't follow the thankee).
 */
export async function thanksAction(input: {
  originalEventType:
    | "recording_pin"
    | "recording_recommendation"
    | "personal_recording_recommendation";
  originalEventId: number;
  blurb?: string;
}): Promise<ThanksResult> {
  const session = await auth();
  const viewer = session?.user?.mbUsername;
  if (!viewer) return { ok: false, reason: "Sign in to do that." };
  const token = await getLbTokenForRequest();
  if (!token) {
    return {
      ok: false,
      reason: "Add your ListenBrainz token in /settings/connections.",
    };
  }
  try {
    await submitThanks(viewer, token, input);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Couldn't thank.",
    };
  }
}
