"use server";

import { revalidatePath } from "next/cache";
import {
  clearLbTokenCookie,
  setLbTokenCookie,
  validateLbToken,
} from "@/lib/lb-token";
import { signOut } from "@/auth";

export type SaveLbTokenState =
  | { status: "idle" }
  | { status: "success"; userName: string }
  | { status: "error"; message: string };

export async function saveLbTokenAction(
  _prev: SaveLbTokenState,
  formData: FormData,
): Promise<SaveLbTokenState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) {
    return { status: "error", message: "Paste a token first." };
  }
  const result = await validateLbToken(token);
  if (!result.valid) {
    return { status: "error", message: result.reason };
  }
  await setLbTokenCookie(token);
  revalidatePath("/settings/connections");
  revalidatePath("/settings");
  return { status: "success", userName: result.userName };
}

export async function clearLbTokenAction(): Promise<void> {
  await clearLbTokenCookie();
  revalidatePath("/settings/connections");
  revalidatePath("/settings");
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
