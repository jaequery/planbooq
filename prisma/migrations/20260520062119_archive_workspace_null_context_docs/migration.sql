-- Workspace-null ContextDoc rows are deprecated by PLAN-DAWOZA.
-- The ADRs say project-scoped docs mirror canonical repo files and reach
-- Workers via the worktree; workspace-null docs reach no one. Archive them.
-- Idempotent: only touches rows that are not already archived.
UPDATE "ContextDoc"
SET "archivedAt" = NOW()
WHERE "projectId" IS NULL AND "archivedAt" IS NULL;
