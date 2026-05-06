-- Differentiate AgentJob rows so PLAN, EXECUTE, and CHAT streams can share the
-- same persistence path while UI components hydrate the right one per ticket.
ALTER TABLE "AgentJob" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'CHAT';

CREATE INDEX IF NOT EXISTS "AgentJob_ticketId_kind_createdAt_idx"
  ON "AgentJob"("ticketId", "kind", "createdAt");
