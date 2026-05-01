import { PrismaAdapter } from "@auth/prisma-adapter";
import { Prisma } from "@prisma/client";
import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import GitHub from "next-auth/providers/github";
import { env } from "@/env";
import { DEFAULT_STATUSES } from "@/lib/default-statuses";
import { logger } from "@/lib/logger";
import { prisma } from "@/server/db";

function tolerantAdapter(): Adapter {
  const base = PrismaAdapter(prisma) as Adapter;
  const isMissing = (e: unknown): boolean =>
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025";
  return {
    ...base,
    deleteSession: async (sessionToken: string): Promise<void> => {
      try {
        await base.deleteSession?.(sessionToken);
      } catch (e) {
        if (isMissing(e)) return;
        throw e;
      }
    },
    // Refresh token + scope on every sign-in. Default PrismaAdapter only
    // creates the row once, so scope expansions never propagate.
    linkAccount: async (account) => {
      await prisma.account.upsert({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
        },
        create: account as Prisma.AccountUncheckedCreateInput,
        update: {
          access_token: account.access_token ?? null,
          refresh_token: account.refresh_token ?? null,
          expires_at: account.expires_at ?? null,
          scope: account.scope ?? null,
          token_type: account.token_type ?? null,
          id_token: account.id_token ?? null,
          session_state:
            typeof account.session_state === "string" ? account.session_state : null,
        },
      });
    },
  };
}

async function ensurePersonalWorkspace(userId: string): Promise<void> {
  const existing = await prisma.member.findFirst({
    where: { userId },
    select: { workspaceId: true },
  });

  if (existing) return;

  const slug = `u-${userId.slice(0, 10).toLowerCase()}`;

  await prisma.workspace.create({
    data: {
      slug,
      name: "Personal",
      members: {
        create: { userId, role: "OWNER" },
      },
      statuses: {
        create: DEFAULT_STATUSES.map((s) => ({
          key: s.key,
          name: s.name,
          color: s.color,
          position: s.position,
        })),
      },
    },
  });

  logger.info("workspace.bootstrapped", { userId, slug });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: tolerantAdapter(),
  session: { strategy: "database" },
  secret: env.NEXTAUTH_SECRET,
  // Dev (NODE_ENV !== "production") auto-trusts the host so Auth.js endpoints
  // don't 500 without extra env. In production, AUTH_TRUST_HOST=true must be set
  // explicitly (typically when running behind a trusted reverse proxy).
  trustHost: process.env.AUTH_TRUST_HOST === "true" || process.env.NODE_ENV !== "production",
  providers: [
    GitHub({
      clientId: env.GITHUB_ID,
      clientSecret: env.GITHUB_SECRET,
      allowDangerousEmailAccountLinking: true,
      authorization: { params: { scope: "read:user user:email repo" } },
    }),
  ],
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    redirect: async ({ url, baseUrl }) => {
      try {
        return new URL(url, baseUrl).origin === baseUrl ? url : baseUrl;
      } catch {
        return baseUrl;
      }
    },
  },
  events: {
    createUser: async ({ user }) => {
      if (!user.id) return;
      await ensurePersonalWorkspace(user.id);
    },
    signIn: async ({ user }) => {
      if (!user.id) return;
      await ensurePersonalWorkspace(user.id);
    },
  },
});
