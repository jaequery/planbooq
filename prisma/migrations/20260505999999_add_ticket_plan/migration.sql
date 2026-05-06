-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "activePlanId" TEXT;

-- CreateTable
CREATE TABLE "TicketPlan" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketPlan_ticketId_createdAt_idx" ON "TicketPlan"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_activePlanId_key" ON "Ticket"("activePlanId");

-- AddForeignKey
ALTER TABLE "TicketPlan" ADD CONSTRAINT "TicketPlan_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_activePlanId_fkey" FOREIGN KEY ("activePlanId") REFERENCES "TicketPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
