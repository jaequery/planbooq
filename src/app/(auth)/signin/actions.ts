"use server";

import { z } from "zod";

import { signIn } from "@/server/auth";

const SignInSchema = z.object({
  email: z.string().email(),
});

export type SignInState = {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
};

export async function sendMagicLink(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = SignInSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Please enter a valid email address." };
  }

  try {
    await signIn("nodemailer", {
      email: parsed.data.email,
      redirect: false,
      redirectTo: "/",
    });
    return { status: "sent", email: parsed.data.email };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send magic link.";
    return { status: "error", message };
  }
}
