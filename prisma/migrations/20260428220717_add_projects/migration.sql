-- CreateTable: Project
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "description" TEXT,
    "repoUrl" TEXT,
    "techStack" TEXT,
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_workspaceId_position_idx" ON "Project"("workspaceId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Project_workspaceId_slug_key" ON "Project"("workspaceId", "slug");

-- AddForeignKey: Project -> Workspace
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add projectId nullable first so existing tickets don't break
ALTER TABLE "Ticket" ADD COLUMN "projectId" TEXT;

-- Data migration: create a default "Untitled" Project per existing Workspace
INSERT INTO "Project" ("id", "workspaceId", "slug", "name", "color", "position", "createdAt", "updatedAt")
SELECT
  'p_' || substr(md5(random()::text || w."id"), 1, 24),
  w."id",
  'untitled',
  'Untitled',
  '#6366f1',
  1,
  NOW(),
  NOW()
FROM "Workspace" w
WHERE NOT EXISTS (
  SELECT 1 FROM "Project" p WHERE p."workspaceId" = w."id"
);

-- Backfill tickets: each existing ticket gets the first project of its workspace
UPDATE "Ticket" t
SET "projectId" = (
  SELECT p."id"
  FROM "Project" p
  WHERE p."workspaceId" = t."workspaceId"
  ORDER BY p."position" ASC
  LIMIT 1
)
WHERE t."projectId" IS NULL;

-- Now enforce NOT NULL
ALTER TABLE "Ticket" ALTER COLUMN "projectId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Ticket_projectId_statusId_position_idx" ON "Ticket"("projectId", "statusId", "position");

-- AddForeignKey: Ticket -> Project
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
