import { NextResponse } from "next/server";

import { env } from "@/env";
import { logger } from "@/lib/logger";
import {
  autoCompleteTicketByPrUrl,
  linkTicketPrUrlFromPrBody,
  verifyGitHubSignature,
} from "@/server/services/webhook-github";

export const runtime = "nodejs";

type PullRequestPayload = {
  action: string;
  pull_request: {
    html_url: string;
    merged: boolean;
    body: string | null;
  };
};

function isPullRequestPayload(value: unknown): value is PullRequestPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.action !== "string") return false;
  const pr = v.pull_request;
  if (!pr || typeof pr !== "object") return false;
  const p = pr as Record<string, unknown>;
  if (typeof p.html_url !== "string" || typeof p.merged !== "boolean") return false;
  return p.body === null || typeof p.body === "string" || p.body === undefined;
}

export async function POST(req: Request): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!verifyGitHubSignature(env.GITHUB_WEBHOOK_SECRET, rawBody, signature)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event");
  if (event !== "pull_request") {
    return new NextResponse(null, { status: 204 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!isPullRequestPayload(parsed)) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }
  const prUrl = parsed.pull_request.html_url;

  if (parsed.action === "opened" || parsed.action === "edited" || parsed.action === "reopened") {
    const link = await linkTicketPrUrlFromPrBody(prUrl, parsed.pull_request.body);
    logger.info("github.webhook.handled", { action: parsed.action, prUrl, outcome: link.kind });
    return NextResponse.json({ ok: true, outcome: link.kind });
  }

  if (parsed.action !== "closed" || !parsed.pull_request.merged) {
    return new NextResponse(null, { status: 204 });
  }

  await linkTicketPrUrlFromPrBody(prUrl, parsed.pull_request.body);
  const outcome = await autoCompleteTicketByPrUrl(prUrl);
  logger.info("github.webhook.handled", { action: parsed.action, prUrl, outcome: outcome.kind });
  return NextResponse.json({ ok: true, outcome: outcome.kind });
}
