-- WorkflowStep must be owned by exactly one of: a template OR a ticket.
-- Both null = orphan (invisible to every owner-filtered query).
-- Both set = ambiguous parent.
ALTER TABLE "WorkflowStep"
  ADD CONSTRAINT "WorkflowStep_xor_owner"
  CHECK (("templateId" IS NULL) <> ("ticketId" IS NULL));
