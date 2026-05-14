-- Structured step-finish decision. Replaces the legacy `autonomous` ticket
-- label as the gate for "should the next step auto-dispatch?". Agents write
-- this via POST /api/v1/workflow-runs/:runId/finish (a.k.a.
-- `pbq workflow finish`). Null until the agent emits a decision; the
-- auto-chain gate falls back to the label only while `decision IS NULL`.
CREATE TYPE "StepDecision" AS ENUM ('AUTO', 'BLOCK', 'SHIP');

ALTER TABLE "WorkflowStepRun"
  ADD COLUMN "decision" "StepDecision";
