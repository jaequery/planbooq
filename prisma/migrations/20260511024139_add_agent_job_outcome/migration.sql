-- CreateEnum
CREATE TYPE "AgentJobOutcome" AS ENUM ('COMPLETED', 'EMPTY_RESPONSE', 'FAILED');

-- AlterTable
ALTER TABLE "AgentJob" ADD COLUMN     "continuationAttempt" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "outcome" "AgentJobOutcome",
ADD COLUMN     "outcomeReason" TEXT,
ADD COLUMN     "sourceJobId" TEXT;

-- CreateIndex
CREATE INDEX "AgentJob_sourceJobId_idx" ON "AgentJob"("sourceJobId");

-- CreateIndex
CREATE INDEX "AgentJob_ticketId_outcome_idx" ON "AgentJob"("ticketId", "outcome");

-- AddForeignKey
ALTER TABLE "AgentJob" ADD CONSTRAINT "AgentJob_sourceJobId_fkey" FOREIGN KEY ("sourceJobId") REFERENCES "AgentJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
