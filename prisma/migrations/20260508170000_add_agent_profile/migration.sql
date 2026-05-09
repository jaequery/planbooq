-- AgentProfile: AGENTS.md-style persona, workspace-scoped, user-authored.
CREATE TABLE "AgentProfile" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "body" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentProfile_workspaceId_slug_key"
  ON "AgentProfile"("workspaceId", "slug");
CREATE INDEX "AgentProfile_workspaceId_isActive_idx"
  ON "AgentProfile"("workspaceId", "isActive");

ALTER TABLE "AgentProfile"
  ADD CONSTRAINT "AgentProfile_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentProfile"
  ADD CONSTRAINT "AgentProfile_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- TicketAgentProfile: ordered many-to-many between Ticket and AgentProfile.
CREATE TABLE "TicketAgentProfile" (
  "ticketId" TEXT NOT NULL,
  "agentProfileId" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketAgentProfile_pkey" PRIMARY KEY ("ticketId", "agentProfileId")
);

CREATE INDEX "TicketAgentProfile_agentProfileId_idx"
  ON "TicketAgentProfile"("agentProfileId");

ALTER TABLE "TicketAgentProfile"
  ADD CONSTRAINT "TicketAgentProfile_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketAgentProfile"
  ADD CONSTRAINT "TicketAgentProfile_agentProfileId_fkey"
  FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
