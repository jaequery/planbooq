-- DropIndex
DROP INDEX "Message_agentJobId_key";

-- CreateIndex
CREATE INDEX "Message_agentJobId_idx" ON "Message"("agentJobId");
