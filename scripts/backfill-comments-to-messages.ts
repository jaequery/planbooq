/**
 * Backfill: copy every Comment row into a USER-role Message row in the
 * matching ticket's Conversation. Preserves createdAt/updatedAt. Idempotent
 * via a deterministic idempotencyKey derived from the comment id.
 *
 * Strategy: dual-write era. Comments stay readable in their original table;
 * Messages become the new canonical surface. After all consumers (REST API,
 * notification builders, UI) read from Messages, schedule a follow-up to
 * archive/drop Comment.
 *
 * Run with:
 *   pnpm tsx scripts/backfill-comments-to-messages.ts            # dry-run
 *   pnpm tsx scripts/backfill-comments-to-messages.ts --apply    # write
 *
 * Safety:
 *  - Dry-run reports counts and a sample of orphan FKs before any write.
 *  - --apply uses upsert keyed on idempotencyKey; safe to re-run.
 *  - Reconciliation step prints per-ticket Comment vs. Message counts at end.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");

function idempotencyKeyForComment(commentId: string): string {
  return `comment-backfill:${commentId}`;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const totalComments = await prisma.comment.count();
  const totalMessagesAlreadyBackfilled = await prisma.message.count({
    where: { idempotencyKey: { startsWith: "comment-backfill:" } },
  });

  console.log(`comments:           ${totalComments}`);
  console.log(`backfilled already: ${totalMessagesAlreadyBackfilled}`);
  console.log(`pending:            ${totalComments - totalMessagesAlreadyBackfilled}`);

  // Pre-flight: any comments whose ticket has been deleted? (shouldn't happen
  // — Comment.ticketId is FK with onDelete Cascade — but verify.)
  const orphanComments = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count
    FROM "Comment" c
    LEFT JOIN "Ticket" t ON t.id = c."ticketId"
    WHERE t.id IS NULL
  `;
  console.log(`orphan comments (no ticket): ${orphanComments[0]?.count ?? 0n}`);

  if (!APPLY) {
    console.log("\n(dry run — pass --apply to write)");
    await prisma.$disconnect();
    return;
  }

  // Process in batches to avoid loading everything at once.
  const BATCH = 500;
  let cursor: string | undefined;
  let processed = 0;
  let written = 0;

  while (true) {
    const batch = await prisma.comment.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: "asc" },
      take: BATCH,
      select: {
        id: true,
        ticketId: true,
        workspaceId: true,
        authorId: true,
        body: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;

    for (const c of batch) {
      // Lazy-create the conversation per ticket. ticketId @unique upserts to
      // a single row; concurrent backfill runners are safe.
      const conversation = await prisma.conversation.upsert({
        where: { ticketId: c.ticketId },
        create: { ticketId: c.ticketId, workspaceId: c.workspaceId },
        update: {},
      });
      const result = await prisma.message.upsert({
        where: { idempotencyKey: idempotencyKeyForComment(c.id) },
        create: {
          idempotencyKey: idempotencyKeyForComment(c.id),
          conversationId: conversation.id,
          workspaceId: c.workspaceId,
          authorUserId: c.authorId,
          role: "USER",
          body: c.body,
          status: "COMPLETE",
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        },
        update: {},
      });
      if (result.idempotencyKey === idempotencyKeyForComment(c.id)) written++;
      processed++;
    }
    console.log(`  processed=${processed} written=${written}`);
  }

  // Reconciliation: for each ticket that had comments, assert the Message
  // count for the comment-backfill key set is >= comment count.
  const recon = await prisma.$queryRaw<
    { ticketId: string; comments: bigint; backfilled: bigint }[]
  >`
    SELECT
      c."ticketId",
      count(c.id)::bigint AS comments,
      (
        SELECT count(*)::bigint
        FROM "Message" m
        JOIN "Conversation" cv ON cv.id = m."conversationId"
        WHERE cv."ticketId" = c."ticketId"
          AND m."idempotencyKey" LIKE 'comment-backfill:%'
      ) AS backfilled
    FROM "Comment" c
    GROUP BY c."ticketId"
    HAVING count(c.id) > (
      SELECT count(*)::bigint
      FROM "Message" m
      JOIN "Conversation" cv ON cv.id = m."conversationId"
      WHERE cv."ticketId" = c."ticketId"
        AND m."idempotencyKey" LIKE 'comment-backfill:%'
    )
    LIMIT 20
  `;
  if (recon.length > 0) {
    console.error("\nRECONCILIATION FAILED — tickets where comments > backfilled:");
    for (const r of recon) {
      console.error(`  ${r.ticketId}: comments=${r.comments} backfilled=${r.backfilled}`);
    }
    process.exitCode = 1;
  } else {
    console.log("\nreconciliation OK — every comment has a backfilled message.");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
