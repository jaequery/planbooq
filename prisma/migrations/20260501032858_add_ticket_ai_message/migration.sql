-- CreateTable
CREATE TABLE "TicketAiMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'chat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketAiMessage_ticketId_createdAt_idx" ON "TicketAiMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketAiMessage_workspaceId_idx" ON "TicketAiMessage"("workspaceId");

-- AddForeignKey
ALTER TABLE "TicketAiMessage" ADD CONSTRAINT "TicketAiMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAiMessage" ADD CONSTRAINT "TicketAiMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
