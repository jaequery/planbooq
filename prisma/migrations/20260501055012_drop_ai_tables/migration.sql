-- DropForeignKey
ALTER TABLE "AiPanelMessage" DROP CONSTRAINT IF EXISTS "AiPanelMessage_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "AiConversation" DROP CONSTRAINT IF EXISTS "AiConversation_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "AiConversation" DROP CONSTRAINT IF EXISTS "AiConversation_userId_fkey";

-- DropForeignKey
ALTER TABLE "TicketAiMessage" DROP CONSTRAINT IF EXISTS "TicketAiMessage_ticketId_fkey";

-- DropForeignKey
ALTER TABLE "TicketAiMessage" DROP CONSTRAINT IF EXISTS "TicketAiMessage_workspaceId_fkey";

-- DropTable
DROP TABLE IF EXISTS "AiPanelMessage";

-- DropTable
DROP TABLE IF EXISTS "AiConversation";

-- DropTable
DROP TABLE IF EXISTS "TicketAiMessage";
