import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// Inngest keys are required unless the SDK is running in dev mode.
// Set INNGEST_DEV=1 locally (and via `pnpm inngest`); leave it unset on every
// real deploy so missing keys fail fast at env-validation time.
const inngestRequired = process.env.INNGEST_DEV !== "1";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    NEXTAUTH_URL: z.string().url(),
    NEXTAUTH_SECRET: z.string().min(16),
    AUTH_SECRET: z.string().min(16).optional(),
    GITHUB_ID: z.string().min(1),
    GITHUB_SECRET: z.string().min(1),
    GITHUB_WEBHOOK_SECRET: z.string().min(1),
    ABLY_API_KEY: z.string().optional().default(""),
    INNGEST_EVENT_KEY: z
      .string()
      .optional()
      .default("")
      .superRefine((val, ctx) => {
        if (inngestRequired && (!val || val.length === 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "INNGEST_EVENT_KEY is required (set INNGEST_DEV=1 for local dev)",
          });
        }
      }),
    INNGEST_SIGNING_KEY: z
      .string()
      .optional()
      .default("")
      .superRefine((val, ctx) => {
        if (inngestRequired && (!val || val.length === 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "INNGEST_SIGNING_KEY is required (set INNGEST_DEV=1 for local dev)",
          });
        }
      }),
  },
  client: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    AUTH_SECRET: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    GITHUB_ID: process.env.GITHUB_ID,
    GITHUB_SECRET: process.env.GITHUB_SECRET,
    GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
    ABLY_API_KEY: process.env.ABLY_API_KEY,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
  },
  emptyStringAsUndefined: false,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
});
