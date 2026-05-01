"use server";

import { signIn } from "@/server/auth";

export async function signInWithGitHub(): Promise<void> {
  await signIn("github", { redirectTo: "/" });
}
