-- Add per-message attribution to a workflow step. Nullable so historical
-- rows (and any non-workflow chat) stay valid; the FK is SET NULL on delete
-- so a deleted WorkflowStepRun doesn't take its messages with it.

ALTER TABLE "Message" ADD COLUMN "workflowStepRunId" TEXT;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_workflowStepRunId_fkey"
  FOREIGN KEY ("workflowStepRunId") REFERENCES "WorkflowStepRun"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Message_workflowStepRunId_idx" ON "Message"("workflowStepRunId");
