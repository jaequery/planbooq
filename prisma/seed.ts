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
  { key: "todo", name: "Todo", color: "#64748b", position: 2 },
  { key: "building", name: "Building", color: "#f59e0b", position: 3 },
  { key: "review", name: "Review", color: "#3b82f6", position: 4 },
  { key: "completed", name: "Completed", color: "#22c55e", position: 5 },
] as const;

type SeedTicket = {
  statusKey: (typeof DEFAULT_STATUSES)[number]["key"];
  title: string;
  description?: string;
};

const SIDE_TICKETS: SeedTicket[] = [
  { statusKey: "backlog", title: "Try out a tiny CLI for bulk-archiving tickets" },
  { statusKey: "todo", title: "Sketch a 'focus mode' that hides everything but in-progress" },
  { statusKey: "building", title: "Prototype embed-anywhere ticket card" },
  { statusKey: "review", title: "Compare DnD libs: dnd-kit vs framer Reorder" },
  {
    statusKey: "completed",
    title: "Throwaway: experiment with Server Actions revalidation patterns",
  },
];

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
    statusKey: "todo",
    title: "Design variant-picker hot-or-not UI",
    description: "Side-by-side previews, one-click winner select.",
  },
  {
    statusKey: "todo",
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

  const planbooqProject = await prisma.project.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: "planbooq" } },
    update: {
      name: "Planbooq",
      color: "#10b981",
      description: "Dogfood project",
      repoUrl: "https://github.com/jaequery/planbooq",
      techStack:
        "Next.js 16 + Prisma + Postgres + Ably + Inngest. Use shadcn for all UI. Strict TypeScript.",
      position: 1,
    },
    create: {
      workspaceId: workspace.id,
      slug: "planbooq",
      name: "Planbooq",
      color: "#10b981",
      description: "Dogfood project",
      repoUrl: "https://github.com/jaequery/planbooq",
      techStack:
        "Next.js 16 + Prisma + Postgres + Ably + Inngest. Use shadcn for all UI. Strict TypeScript.",
      position: 1,
    },
  });

  const sideProject = await prisma.project.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: "side-experiment" } },
    update: {
      name: "Side experiment",
      color: "#f59e0b",
      description: "Where I prototype throwaway ideas",
      position: 2,
    },
    create: {
      workspaceId: workspace.id,
      slug: "side-experiment",
      name: "Side experiment",
      color: "#f59e0b",
      description: "Where I prototype throwaway ideas",
      position: 2,
    },
  });

  // Re-point any existing seeded tickets that lack a real project to Planbooq.
  await prisma.ticket.updateMany({
    where: {
      workspaceId: workspace.id,
      projectId: { not: planbooqProject.id },
      project: { slug: "untitled" },
    },
    data: { projectId: planbooqProject.id },
  });

  async function seedTicketsForProject(projectId: string, tickets: SeedTicket[]): Promise<void> {
    const existing = await prisma.ticket.count({ where: { projectId } });
    if (existing > 0) return;

    const positionByStatus = new Map<string, number>();
    for (const t of tickets) {
      const statusId = statusByKey.get(t.statusKey);
      if (!statusId) continue;
      const next = (positionByStatus.get(statusId) ?? 0) + 1;
      positionByStatus.set(statusId, next);

      await prisma.ticket.create({
        data: {
          workspaceId: workspace.id,
          projectId,
          statusId,
          title: t.title,
          description: t.description ?? null,
          position: next,
          createdById: user.id,
        },
      });
    }
  }

  await seedTicketsForProject(planbooqProject.id, SEED_TICKETS);
  await seedTicketsForProject(sideProject.id, SIDE_TICKETS);

  const ticketTotal = await prisma.ticket.count({ where: { workspaceId: workspace.id } });
  const projectTotal = await prisma.project.count({ where: { workspaceId: workspace.id } });

  console.error(
    JSON.stringify({
      level: "info",
      message: "seed.complete",
      workspace: workspace.slug,
      user: user.email,
      projects: projectTotal,
      tickets: ticketTotal,
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
