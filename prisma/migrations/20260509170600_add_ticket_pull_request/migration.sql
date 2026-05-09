-- Pull request history per ticket. Each ticket can have many PRs across its
-- lifetime (re-do, follow-up changes after merge, etc.). The legacy
-- Ticket.prUrl column stays as a "current/latest" pointer for backward compat.

CREATE TYPE "TicketPullRequestStatus" AS ENUM ('OPEN', 'MERGED', 'CLOSED', 'SUPERSEDED');

CREATE TABLE "TicketPullRequest" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "status" "TicketPullRequestStatus" NOT NULL DEFAULT 'OPEN',
  "branch" TEXT,
  "targetBranch" TEXT,
  "summary" TEXT,
  "filesChanged" INTEGER,
  "additions" INTEGER,
  "deletions" INTEGER,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "mergedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "supersededAt" TIMESTAMP(3),
  CONSTRAINT "TicketPullRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TicketPullRequest_ticketId_url_key"
  ON "TicketPullRequest"("ticketId", "url");
CREATE INDEX "TicketPullRequest_ticketId_openedAt_idx"
  ON "TicketPullRequest"("ticketId", "openedAt");

ALTER TABLE "TicketPullRequest"
  ADD CONSTRAINT "TicketPullRequest_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing Ticket.prUrl values into the history table. Status is
-- inferred from the ticket's current status name: tickets in a "Completed"
-- status are treated as MERGED, otherwise OPEN. We use the ticket's own
-- updatedAt as a coarse opened/merged timestamp since we have no better signal.
INSERT INTO "TicketPullRequest" ("id", "ticketId", "url", "status", "openedAt", "mergedAt")
SELECT
  'tpr_' || substr(md5(random()::text || t."id"), 1, 24),
  t."id",
  t."prUrl",
  CASE WHEN lower(s."name") = 'completed' THEN 'MERGED'::"TicketPullRequestStatus"
       ELSE 'OPEN'::"TicketPullRequestStatus" END,
  t."createdAt",
  CASE WHEN lower(s."name") = 'completed' THEN t."updatedAt" ELSE NULL END
FROM "Ticket" t
JOIN "Status" s ON s."id" = t."statusId"
WHERE t."prUrl" IS NOT NULL
ON CONFLICT ("ticketId", "url") DO NOTHING;
