-- Re-point any tickets currently in a "shipping" status to the workspace's "review" status.
UPDATE "Ticket" t
SET "statusId" = r.id
FROM "Status" s
JOIN "Status" r
  ON r."workspaceId" = s."workspaceId"
 AND r."key" = 'review'
WHERE t."statusId" = s.id
  AND s."key" = 'shipping';

-- Delete any remaining tickets in a "shipping" status whose workspace has no "review" fallback.
DELETE FROM "Ticket" t
USING "Status" s
WHERE t."statusId" = s.id
  AND s."key" = 'shipping';

-- Drop the "shipping" status from every workspace.
DELETE FROM "Status" WHERE "key" = 'shipping';
