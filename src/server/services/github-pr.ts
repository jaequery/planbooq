import "server-only";

import { z } from "zod";
import { logger } from "@/lib/logger";
import { prisma } from "@/server/db";

export type ParsedPr = { owner: string; repo: string; number: number; htmlUrl: string };

export type PrStatus = {
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  mergeable: boolean | null;
  mergeableState: string;
  title: string;
  number: number;
  htmlUrl: string;
};

export type GetPrStatusOutcome =
  | { kind: "ok"; status: PrStatus }
  | { kind: "no-token" }
  | { kind: "missing-scope" }
  | { kind: "not-found" }
  | { kind: "rate-limited" }
  | { kind: "error"; message: string };

export type MergePrOutcome =
  | { kind: "ok"; sha: string; merged: true }
  | { kind: "no-token" }
  | { kind: "missing-scope" }
  | { kind: "not-mergeable"; message: string }
  | { kind: "conflict"; message: string }
  | { kind: "rate-limited" }
  | { kind: "error"; message: string };

const GITHUB_PR_URL_RE = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/i;

export function parseGitHubPrUrl(url: string | null | undefined): ParsedPr | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const m = trimmed.match(GITHUB_PR_URL_RE);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2];
  const numStr = m[3];
  if (!owner || !repo || !numStr) return null;
  const number = Number.parseInt(numStr, 10);
  if (!Number.isFinite(number) || number <= 0) return null;
  return {
    owner,
    repo,
    number,
    htmlUrl: `https://github.com/${owner}/${repo}/pull/${number}`,
  };
}

const PrResponseSchema = z.object({
  number: z.number(),
  state: z.string(),
  draft: z.boolean().optional().nullable(),
  merged: z.boolean().optional().nullable(),
  mergeable: z.boolean().nullable().optional(),
  mergeable_state: z.string().optional().nullable(),
  title: z.string(),
  html_url: z.string(),
});

const MergeResponseSchema = z.object({
  sha: z.string(),
  merged: z.boolean(),
  message: z.string().optional().nullable(),
});

const ErrorBodySchema = z.object({
  message: z.string().optional().nullable(),
});

type TokenLookup = { kind: "ok"; token: string } | { kind: "no-token" } | { kind: "missing-scope" };

function scopeHasRepo(scope: string | null | undefined): boolean {
  if (!scope) return true; // unknown scope: do not pre-block; let GitHub be the source of truth
  // GitHub OAuth scopes are space- or comma-separated.
  const tokens = scope.split(/[\s,]+/).filter(Boolean);
  return tokens.includes("repo");
}

async function loadGitHubToken(userId: string): Promise<TokenLookup> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
    select: { access_token: true, scope: true },
  });
  if (!account?.access_token) return { kind: "no-token" };
  if (!scopeHasRepo(account.scope)) return { kind: "missing-scope" };
  return { kind: "ok", token: account.access_token };
}

function ghHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "planbooq-app",
  };
}

function isRateLimited(res: Response): boolean {
  if (res.status === 429) return true;
  if (res.status === 403) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0") return true;
  }
  return false;
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const json = await res.json();
    const parsed = ErrorBodySchema.safeParse(json);
    if (parsed.success && parsed.data.message) return parsed.data.message;
  } catch {
    // ignore
  }
  return `github_${res.status}`;
}

export async function getPrStatusForUser(args: {
  userId: string;
  pr: ParsedPr;
}): Promise<GetPrStatusOutcome> {
  const { userId, pr } = args;
  const lookup = await loadGitHubToken(userId);
  if (lookup.kind !== "ok") return { kind: lookup.kind };

  const url = `https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: ghHeaders(lookup.token), cache: "no-store" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "fetch_failed";
    logger.warn("github_pr.status.fetch_error", { owner: pr.owner, repo: pr.repo });
    return { kind: "error", message };
  }

  if (isRateLimited(res)) return { kind: "rate-limited" };
  if (res.status === 401 || res.status === 403) return { kind: "missing-scope" };
  if (res.status === 404) return { kind: "not-found" };
  if (!res.ok) {
    const message = await readErrorMessage(res);
    return { kind: "error", message };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { kind: "error", message: "invalid_response" };
  }
  const parsed = PrResponseSchema.safeParse(json);
  if (!parsed.success) return { kind: "error", message: "invalid_response_shape" };
  const d = parsed.data;
  const stateLower = d.state === "closed" ? "closed" : "open";
  const status: PrStatus = {
    state: stateLower,
    draft: Boolean(d.draft),
    merged: Boolean(d.merged),
    mergeable: d.mergeable ?? null,
    mergeableState: d.mergeable_state ?? "unknown",
    title: d.title,
    number: d.number,
    htmlUrl: d.html_url,
  };
  return { kind: "ok", status };
}

export async function mergePrForUser(args: {
  userId: string;
  pr: ParsedPr;
}): Promise<MergePrOutcome> {
  const { userId, pr } = args;
  const lookup = await loadGitHubToken(userId);
  if (lookup.kind !== "ok") return { kind: lookup.kind };

  const url = `https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/merge`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: { ...ghHeaders(lookup.token), "Content-Type": "application/json" },
      body: JSON.stringify({ merge_method: "squash" }),
      cache: "no-store",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "fetch_failed";
    logger.warn("github_pr.merge.fetch_error", { owner: pr.owner, repo: pr.repo });
    return { kind: "error", message };
  }

  if (isRateLimited(res)) return { kind: "rate-limited" };

  if (res.status === 200) {
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { kind: "error", message: "invalid_response" };
    }
    const parsed = MergeResponseSchema.safeParse(json);
    if (!parsed.success || !parsed.data.merged) {
      return { kind: "error", message: "invalid_merge_response" };
    }
    logger.info("github_pr.merge.ok", {
      owner: pr.owner,
      repo: pr.repo,
      number: pr.number,
      sha: parsed.data.sha,
    });
    return { kind: "ok", sha: parsed.data.sha, merged: true };
  }

  const message = await readErrorMessage(res);
  if (res.status === 403) {
    logger.info("github_pr.merge.fail", { reason: "missing-scope", number: pr.number });
    return { kind: "missing-scope" };
  }
  if (res.status === 404) {
    logger.info("github_pr.merge.fail", { reason: "not-found", number: pr.number });
    return { kind: "error", message };
  }
  if (res.status === 405) {
    logger.info("github_pr.merge.fail", { reason: "not-mergeable", number: pr.number });
    return { kind: "not-mergeable", message };
  }
  if (res.status === 409) {
    logger.info("github_pr.merge.fail", { reason: "conflict", number: pr.number });
    return { kind: "conflict", message };
  }
  if (res.status === 422) {
    logger.info("github_pr.merge.fail", { reason: "not-mergeable-422", number: pr.number });
    return { kind: "not-mergeable", message };
  }
  logger.warn("github_pr.merge.fail", {
    reason: "error",
    status: res.status,
    number: pr.number,
  });
  return { kind: "error", message };
}
