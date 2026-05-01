import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// INNGEST_REQUIRED is an explicit prod-deploy flag so that local `pnpm build`
// (which runs in NODE_ENV=production) doesn't crash when the keys are absent.
// Set INNGEST_REQUIRED=true on real production deploys to enforce signing.
const inngestRequired = process.env.INNGEST_REQUIRED === "true";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    NEXTAUTH_URL: z.string().url(),
    NEXTAUTH_SECRET: z.string().min(16),
    AUTH_SECRET: z.string().min(16).optional(),
    AUTH_GITHUB_ID: z.string().min(1),
    AUTH_GITHUB_SECRET: z.string().min(1),
    GITHUB_WEBHOOK_SECRET: z.string().min(1),
    ABLY_API_KEY: z.string().optional().default(""),
    INNGEST_REQUIRED: z.string().optional().default(""),
    INNGEST_EVENT_KEY: z
      .string()
      .optional()
      .default("")
      .superRefine((val, ctx) => {
        if (inngestRequired && (!val || val.length === 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "INNGEST_EVENT_KEY is required when INNGEST_REQUIRED=true",
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
            message: "INNGEST_SIGNING_KEY is required when INNGEST_REQUIRED=true",
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
    AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
    AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
    GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
    ABLY_API_KEY: process.env.ABLY_API_KEY,
    INNGEST_REQUIRED: process.env.INNGEST_REQUIRED,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
  },
  emptyStringAsUndefined: false,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
});
