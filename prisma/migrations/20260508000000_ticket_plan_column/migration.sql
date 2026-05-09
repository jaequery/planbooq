-- Replace TicketPlan model with a single `plan` text column on Ticket.
ALTER TABLE "Ticket" ADD COLUMN "plan" TEXT;

-- Backfill: copy each ticket's active plan content into Ticket.plan.
UPDATE "Ticket" t
SET "plan" = p."content"
FROM "TicketPlan" p
WHERE t."activePlanId" = p."id";

ALTER TABLE "Ticket" DROP CONSTRAINT IF EXISTS "Ticket_activePlanId_fkey";
ALTER TABLE "TicketPlan" DROP CONSTRAINT IF EXISTS "TicketPlan_ticketId_fkey";
DROP INDEX IF EXISTS "Ticket_activePlanId_key";
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "activePlanId";
DROP TABLE IF EXISTS "TicketPlan";
