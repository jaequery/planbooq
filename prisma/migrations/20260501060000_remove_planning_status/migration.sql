-- Re-point any tickets currently in a "planning" status to the workspace's "todo" status.
UPDATE "Ticket" t
SET "statusId" = r.id
FROM "Status" s
JOIN "Status" r
  ON r."workspaceId" = s."workspaceId"
 AND r."key" = 'todo'
WHERE t."statusId" = s.id
  AND s."key" = 'planning';

-- Delete any remaining tickets in a "planning" status whose workspace has no "todo" fallback.
DELETE FROM "Ticket" t
USING "Status" s
WHERE t."statusId" = s.id
  AND s."key" = 'planning';

-- Drop the "planning" status from every workspace.
DELETE FROM "Status" WHERE "key" = 'planning';
