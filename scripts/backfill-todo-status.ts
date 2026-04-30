/**
 * Backfill: add a "Todo" status to every existing workspace that doesn't have one.
 * Inserts between "Planning" and "Building" so the column order matches the new
 * default seed without disturbing existing tickets.
 *
 * Run with: pnpm tsx scripts/backfill-todo-status.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const workspaces = await prisma.workspace.findMany({ select: { id: true, slug: true } });
  let added = 0;
  let skipped = 0;

  for (const ws of workspaces) {
    const existing = await prisma.status.findFirst({
      where: { workspaceId: ws.id, key: "todo" },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const planning = await prisma.status.findFirst({
      where: { workspaceId: ws.id, key: "planning" },
    });
    const building = await prisma.status.findFirst({
      where: { workspaceId: ws.id, key: "building" },
    });

    // Place between planning and building if both exist; otherwise append.
    let position: number;
    if (planning && building) {
      position = (planning.position + building.position) / 2;
    } else if (planning) {
      position = planning.position + 0.5;
    } else {
      const last = await prisma.status.findFirst({
        where: { workspaceId: ws.id },
        orderBy: { position: "desc" },
      });
      position = (last?.position ?? 0) + 1;
    }

    await prisma.status.create({
      data: {
        workspaceId: ws.id,
        key: "todo",
        name: "Todo",
        color: "#64748b",
        position,
      },
    });
    console.log(`  ✓ added Todo to workspace ${ws.slug} (position=${position})`);
    added++;
  }

  console.log(`\nDone. Added: ${added}, skipped (already had Todo): ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
