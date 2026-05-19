-- Triple-pillar foundation: introduces Context and Skill as first-class
-- workspace-scoped resources, alongside the existing Tasks and AgentProfile
-- pillars. Phase 1 only — search, version history, and rich-editor work are
-- deferred to follow-up tickets (see ticket PLAN-SVJOFZ plan).

-- -----------------------------
-- Context pillar
-- -----------------------------

CREATE TYPE "ContextDocKind" AS ENUM (
  'SCOPE',
  'DECISION',
  'ARCHITECTURE',
  'DEPENDENCY',
  'CONSTRAINT',
  'PATTERN',
  'OTHER'
);

CREATE TABLE "ContextDoc" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId"   TEXT,
  "title"       TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "kind"        "ContextDocKind" NOT NULL DEFAULT 'OTHER',
  "position"    DOUBLE PRECISION NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "archivedAt"  TIMESTAMP(3),

  CONSTRAINT "ContextDoc_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContextDoc_workspaceId_position_idx"
  ON "ContextDoc"("workspaceId", "position");
CREATE INDEX "ContextDoc_workspaceId_projectId_position_idx"
  ON "ContextDoc"("workspaceId", "projectId", "position");
CREATE INDEX "ContextDoc_workspaceId_kind_idx"
  ON "ContextDoc"("workspaceId", "kind");

ALTER TABLE "ContextDoc"
  ADD CONSTRAINT "ContextDoc_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContextDoc"
  ADD CONSTRAINT "ContextDoc_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContextDoc"
  ADD CONSTRAINT "ContextDoc_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TicketContextDoc" (
  "ticketId"     TEXT NOT NULL,
  "contextDocId" TEXT NOT NULL,
  "position"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TicketContextDoc_pkey" PRIMARY KEY ("ticketId", "contextDocId")
);

CREATE INDEX "TicketContextDoc_contextDocId_idx"
  ON "TicketContextDoc"("contextDocId");

ALTER TABLE "TicketContextDoc"
  ADD CONSTRAINT "TicketContextDoc_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TicketContextDoc"
  ADD CONSTRAINT "TicketContextDoc_contextDocId_fkey"
  FOREIGN KEY ("contextDocId") REFERENCES "ContextDoc"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------
-- Skills pillar
-- -----------------------------

CREATE TABLE "Skill" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "description" TEXT,
  "color"       TEXT NOT NULL DEFAULT '#7c3aed',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Skill_workspaceId_slug_key"
  ON "Skill"("workspaceId", "slug");
CREATE INDEX "Skill_workspaceId_name_idx"
  ON "Skill"("workspaceId", "name");

ALTER TABLE "Skill"
  ADD CONSTRAINT "Skill_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AgentProfileSkill" (
  "agentProfileId" TEXT NOT NULL,
  "skillId"        TEXT NOT NULL,
  "level"          INTEGER,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentProfileSkill_pkey" PRIMARY KEY ("agentProfileId", "skillId")
);

CREATE INDEX "AgentProfileSkill_skillId_idx"
  ON "AgentProfileSkill"("skillId");

ALTER TABLE "AgentProfileSkill"
  ADD CONSTRAINT "AgentProfileSkill_agentProfileId_fkey"
  FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentProfileSkill"
  ADD CONSTRAINT "AgentProfileSkill_skillId_fkey"
  FOREIGN KEY ("skillId") REFERENCES "Skill"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TicketSkill" (
  "ticketId"  TEXT NOT NULL,
  "skillId"   TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TicketSkill_pkey" PRIMARY KEY ("ticketId", "skillId")
);

CREATE INDEX "TicketSkill_skillId_idx"
  ON "TicketSkill"("skillId");

ALTER TABLE "TicketSkill"
  ADD CONSTRAINT "TicketSkill_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TicketSkill"
  ADD CONSTRAINT "TicketSkill_skillId_fkey"
  FOREIGN KEY ("skillId") REFERENCES "Skill"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
