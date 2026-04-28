import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { env } from "@/env";
import { DEFAULT_STATUSES } from "@/lib/default-statuses";
import { logger } from "@/lib/logger";
import { prisma } from "@/server/db";

async function ensurePersonalWorkspace(userId: string): Promise<void> {
  const existing = await prisma.member.findFirst({ where: { userId } });
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
  adapter: PrismaAdapter(prisma),
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
