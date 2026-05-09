-- Backfill a "Blocked" status for every existing workspace that doesn't have one.
-- Sits between Running (3) and Review (4) at position 3.5. Used to surface
-- tickets where the local Claude Code agent is awaiting user input.
INSERT INTO "Status" ("id", "workspaceId", "key", "name", "color", "position", "createdAt")
SELECT
  'st_' || md5(random()::text || clock_timestamp()::text || w.id),
  w.id,
  'blocked',
  'Blocked',
  '#ef4444',
  3.5,
  NOW()
FROM "Workspace" w
WHERE NOT EXISTS (
  SELECT 1 FROM "Status" s WHERE s."workspaceId" = w.id AND s."key" = 'blocked'
);
