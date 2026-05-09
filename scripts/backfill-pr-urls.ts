/**
 * Backfill: walk every ticket with a NULL prUrl and look for a GitHub PR URL
 * in its comments, activity payloads, or agent-job output. First match wins;
 * sets ticket.prUrl. Idempotent — tickets that already have prUrl are skipped.
 *
 * Run with: pnpm tsx scripts/backfill-pr-urls.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const GITHUB_PR_URL_RE_GLOBAL = /https?:\/\/github\.com\/[^/\s)]+\/[^/\s)]+\/pull\/\d+/gi;
const GITHUB_PR_URL_RE = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/i;

function findFirstPrUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const matches = text.match(GITHUB_PR_URL_RE_GLOBAL);
  if (!matches) return null;
  for (const raw of matches) {
    const m = raw.match(GITHUB_PR_URL_RE);
    if (!m) continue;
    const [, owner, repo, num] = m;
    if (owner && repo && num) return `https://github.com/${owner}/${repo}/pull/${num}`;
  }
  return null;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const tickets = await prisma.ticket.findMany({
    where: { prUrl: null, archivedAt: null },
    select: { id: true, identifier: true },
  });
  console.log(`scanning ${tickets.length} tickets without prUrl`);

  let linked = 0;
  let skipped = 0;

  for (const t of tickets) {
    const [comments, activities, jobs] = await Promise.all([
      prisma.comment.findMany({
        where: { ticketId: t.id },
        select: { body: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.ticketActivity.findMany({
        where: { ticketId: t.id },
        select: { payload: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.agentJob.findMany({
        where: { ticketId: t.id },
        select: { output: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    let url: string | null = null;
    for (const c of comments) {
      url = findFirstPrUrl(c.body);
      if (url) break;
    }
    if (!url) {
      for (const a of activities) {
        url = findFirstPrUrl(JSON.stringify(a.payload));
        if (url) break;
      }
    }
    if (!url) {
      for (const j of jobs) {
        url = findFirstPrUrl(j.output);
        if (url) break;
      }
    }

    if (!url) {
      skipped++;
      continue;
    }

    await prisma.ticket.update({ where: { id: t.id }, data: { prUrl: url } });
    linked++;
    console.log(`  ${t.identifier} → ${url}`);
  }

  console.log(`done. linked=${linked} skipped=${skipped}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
