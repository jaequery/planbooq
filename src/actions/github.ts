"use server";

import { logger } from "@/lib/logger";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export type GithubRepo = {
  id: number;
  fullName: string;
  name: string;
  description: string | null;
  htmlUrl: string;
  private: boolean;
  language: string | null;
  pushedAt: string | null;
};

type ListResult =
  | { ok: true; repos: GithubRepo[] }
  | { ok: false; error: "unauthorized" | "no_github" | "missing_scope" | "rate_limited" | "github_error" };

function scopeHasRepo(scope: string | null | undefined): boolean {
  if (!scope) return true;
  const tokens = scope.split(/[\s,]+/).filter(Boolean);
  return tokens.includes("repo");
}

async function loadToken(
  userId: string,
): Promise<{ ok: true; token: string } | { ok: false; error: "no_github" | "missing_scope" }> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
    select: { access_token: true, scope: true },
  });
  if (!account?.access_token) return { ok: false, error: "no_github" };
  if (!scopeHasRepo(account.scope)) return { ok: false, error: "missing_scope" };
  return { ok: true, token: account.access_token };
}

function ghHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "planbooq-app",
  };
}

export async function listGithubRepos(): Promise<ListResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "unauthorized" };
  const token = await loadToken(session.user.id);
  if (!token.ok) return { ok: false, error: token.error };

  try {
    const res = await fetch(
      "https://api.github.com/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member",
      { headers: ghHeaders(token.token), cache: "no-store" },
    );
    if (!res.ok) {
      if (res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0")) {
        return { ok: false, error: "rate_limited" };
      }
      return { ok: false, error: "github_error" };
    }
    const raw = (await res.json()) as Array<{
      id: number;
      full_name: string;
      name: string;
      description: string | null;
      html_url: string;
      private: boolean;
      language: string | null;
      pushed_at: string | null;
    }>;
    const repos: GithubRepo[] = raw.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      name: r.name,
      description: r.description,
      htmlUrl: r.html_url,
      private: r.private,
      language: r.language,
      pushedAt: r.pushed_at,
    }));
    return { ok: true, repos };
  } catch (error) {
    logger.error("listGithubRepos.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: "github_error" };
  }
}
