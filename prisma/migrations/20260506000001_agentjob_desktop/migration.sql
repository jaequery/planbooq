-- DropForeignKey
ALTER TABLE "AgentJob" DROP CONSTRAINT IF EXISTS "AgentJob_agentId_fkey";

-- AlterTable
ALTER TABLE "AgentJob" ALTER COLUMN "agentId" DROP NOT NULL;
ALTER TABLE "AgentJob" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "AgentJob" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "AgentJob" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'PAIRED';
ALTER TABLE "AgentJob" ADD COLUMN IF NOT EXISTS "worktreePath" TEXT;
ALTER TABLE "AgentJob" ADD COLUMN IF NOT EXISTS "claudeSessionId" TEXT;

-- AddForeignKey
ALTER TABLE "AgentJob" ADD CONSTRAINT "AgentJob_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgentJob_ticketId_status_idx" ON "AgentJob"("ticketId", "status");
