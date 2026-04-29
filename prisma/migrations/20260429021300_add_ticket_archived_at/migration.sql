-- Add soft-archive support for launch-safe ticket deletion.
ALTER TABLE "Ticket" ADD COLUMN "archivedAt" TIMESTAMP(3);
