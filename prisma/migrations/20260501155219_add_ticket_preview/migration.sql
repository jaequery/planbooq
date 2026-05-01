-- CreateTable
CREATE TABLE "TicketPreview" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "label" TEXT,
    "position" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketPreview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketPreview_ticketId_position_idx" ON "TicketPreview"("ticketId", "position");

-- CreateIndex
CREATE INDEX "TicketPreview_attachmentId_idx" ON "TicketPreview"("attachmentId");

-- AddForeignKey
ALTER TABLE "TicketPreview" ADD CONSTRAINT "TicketPreview_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPreview" ADD CONSTRAINT "TicketPreview_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPreview" ADD CONSTRAINT "TicketPreview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
