import { NextResponse } from "next/server";

import { env } from "@/env";
import { logger } from "@/lib/logger";
import { autoCompleteTicketByPrUrl, verifyGitHubSignature } from "@/server/services/webhook-github";

export const runtime = "nodejs";

type PullRequestPayload = {
  action: string;
  pull_request: {
    html_url: string;
    merged: boolean;
  };
};

function isPullRequestPayload(value: unknown): value is PullRequestPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.action !== "string") return false;
  const pr = v.pull_request;
  if (!pr || typeof pr !== "object") return false;
  const p = pr as Record<string, unknown>;
  return typeof p.html_url === "string" && typeof p.merged === "boolean";
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
  if (parsed.action !== "closed" || !parsed.pull_request.merged) {
    return new NextResponse(null, { status: 204 });
  }

  const outcome = await autoCompleteTicketByPrUrl(parsed.pull_request.html_url);
  logger.info("github.webhook.handled", {
    prUrl: parsed.pull_request.html_url,
    outcome: outcome.kind,
  });
  return NextResponse.json({ ok: true, outcome: outcome.kind });
}
