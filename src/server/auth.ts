import { PrismaAdapter } from "@auth/prisma-adapter";
import { Prisma } from "@prisma/client";
import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import GitHub from "next-auth/providers/github";
import Nodemailer from "next-auth/providers/nodemailer";
import { env } from "@/env";
import { DEFAULT_STATUSES } from "@/lib/default-statuses";
import { logger } from "@/lib/logger";
import { prisma } from "@/server/db";

export const isGitHubConfigured = Boolean(env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET);

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
  };
}

async function ensurePersonalWorkspace(userId: string): Promise<void> {
  const existing = await prisma.member.findFirst({
    where: { userId },
    select: { workspaceId: true },
  });

  if (existing) {
    // Idempotent: ensure the workspace has at least one project.
    const projectCount = await prisma.project.count({
      where: { workspaceId: existing.workspaceId },
    });
    if (projectCount === 0) {
      await prisma.project.create({
        data: {
          workspaceId: existing.workspaceId,
          slug: "untitled",
          name: "Untitled",
          color: "#6366f1",
          position: 1,
        },
      });
      logger.info("workspace.project.bootstrapped", {
        workspaceId: existing.workspaceId,
      });
    }
    return;
  }

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
      projects: {
        create: {
          slug: "untitled",
          name: "Untitled",
          color: "#6366f1",
          position: 1,
        },
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
    Nodemailer({
      server: env.EMAIL_SERVER,
      from: env.EMAIL_FROM,
    }),
    ...(isGitHubConfigured
      ? [
          GitHub({
            clientId: env.AUTH_GITHUB_ID,
            clientSecret: env.AUTH_GITHUB_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ] satisfies NextAuthConfig["providers"],
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
