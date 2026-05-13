-- Link workflow step activity rows to the durable step run they describe.
ALTER TABLE "TicketActivity"
  ADD COLUMN "workflowStepRunId" TEXT;

ALTER TABLE "TicketActivity"
  ADD CONSTRAINT "TicketActivity_workflowStepRunId_fkey"
  FOREIGN KEY ("workflowStepRunId") REFERENCES "WorkflowStepRun"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TicketActivity_workflowStepRunId_idx"
  ON "TicketActivity"("workflowStepRunId");

CREATE UNIQUE INDEX "TicketActivity_workflowStepRunId_kind_key"
  ON "TicketActivity"("workflowStepRunId", "kind");
