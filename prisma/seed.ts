import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const DEFAULT_STATUSES = [
  { key: "backlog", name: "Backlog", color: "#94a3b8", position: 1 },
  { key: "planning", name: "Planning", color: "#a78bfa", position: 2 },
  { key: "building", name: "Building", color: "#f59e0b", position: 3 },
  { key: "review", name: "Review", color: "#3b82f6", position: 4 },
  { key: "shipping", name: "Shipping", color: "#06b6d4", position: 5 },
  { key: "completed", name: "Completed", color: "#22c55e", position: 6 },
] as const;

type SeedTicket = {
  statusKey: (typeof DEFAULT_STATUSES)[number]["key"];
  title: string;
  description?: string;
};

const SEED_TICKETS: SeedTicket[] = [
  {
    statusKey: "backlog",
    title: "Wire up parallel variants for ticket A",
    description: "Spawn 3 agent variants per ticket with isolated worktrees.",
  },
  {
    statusKey: "backlog",
    title: "Add taste-vs-logic detection to ticket capture",
  },
  {
    statusKey: "planning",
    title: "Design variant-picker hot-or-not UI",
    description: "Side-by-side previews, one-click winner select.",
  },
  {
    statusKey: "planning",
    title: "Spec live preview URL routing per variant",
  },
  {
    statusKey: "building",
    title: "Implement realtime kanban via Ably channels",
  },
  {
    statusKey: "building",
    title: "Fix dnd ghost flicker on Safari",
  },
  {
    statusKey: "review",
    title: "Variant remix flow — combine two winners",
  },
  {
    statusKey: "review",
    title: "Cmd-K command palette (tickets / statuses / nav)",
  },
  {
    statusKey: "shipping",
    title: "GitHub PR auto-open on winner select",
  },
  {
    statusKey: "completed",
    title: "Skeleton: Next.js 16 + TS strict + shadcn",
    description: "Wave 1 bootstrap shipped.",
  },
  {
    statusKey: "completed",
    title: "Postgres + Prisma + Auth.js + Inngest + Ably wiring",
    description: "Wave 2A backend scaffolding.",
  },
];

async function main(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email: "dev@planbooq.local" },
    update: {},
    create: {
      email: "dev@planbooq.local",
      name: "Dev User",
      emailVerified: new Date(),
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: "demo" },
    update: { name: "Demo Workspace" },
    create: { slug: "demo", name: "Demo Workspace" },
  });

  await prisma.member.upsert({
    where: {
      workspaceId_userId: { workspaceId: workspace.id, userId: user.id },
    },
    update: { role: "OWNER" },
    create: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
  });

  const statusByKey = new Map<string, string>();
  for (const s of DEFAULT_STATUSES) {
    const status = await prisma.status.upsert({
      where: { workspaceId_key: { workspaceId: workspace.id, key: s.key } },
      update: { name: s.name, color: s.color, position: s.position },
      create: {
        workspaceId: workspace.id,
        key: s.key,
        name: s.name,
        color: s.color,
        position: s.position,
      },
    });
    statusByKey.set(s.key, status.id);
  }

  // Idempotent ticket seeding: skip if any tickets already exist for this workspace.
  const existingCount = await prisma.ticket.count({
    where: { workspaceId: workspace.id },
  });

  if (existingCount === 0) {
    const positionByStatus = new Map<string, number>();
    for (const t of SEED_TICKETS) {
      const statusId = statusByKey.get(t.statusKey);
      if (!statusId) continue;
      const next = (positionByStatus.get(statusId) ?? 0) + 1;
      positionByStatus.set(statusId, next);

      await prisma.ticket.create({
        data: {
          workspaceId: workspace.id,
          statusId,
          title: t.title,
          description: t.description ?? null,
          position: next,
          createdById: user.id,
        },
      });
    }
  }

  console.error(
    JSON.stringify({
      level: "info",
      message: "seed.complete",
      workspace: workspace.slug,
      user: user.email,
      ticketsExisting: existingCount,
    }),
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
