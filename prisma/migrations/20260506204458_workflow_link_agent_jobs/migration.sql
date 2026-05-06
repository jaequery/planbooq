-- AlterTable
ALTER TABLE "AgentJob" ADD COLUMN     "workflowStepRunId" TEXT;

-- CreateIndex
CREATE INDEX "AgentJob_workflowStepRunId_idx" ON "AgentJob"("workflowStepRunId");
