import type {
  Label,
  Member,
  Priority,
  Project,
  Role,
  Status,
  Ticket,
  TicketPullRequest,
  User,
  Workspace,
} from "@prisma/client";

export type {
  Label,
  Member,
  Priority,
  Project,
  Role,
  Status,
  Ticket,
  TicketPullRequest,
  User,
  Workspace,
};

export type TicketAssignee = Pick<User, "id" | "name" | "email" | "image">;
export type TicketLabel = Pick<Label, "id" | "name" | "color">;

export type TicketImagePreview = {
  id: string;
  attachmentId: string;
  mimeType: string;
};

export type TicketWithRelations = Ticket & {
  assignee?: TicketAssignee | null;
  labels?: TicketLabel[];
  project?: Pick<Project, "slug"> | null;
  imagePreviews?: TicketImagePreview[];
  pullRequests?: TicketPullRequest[];
};

export type StatusWithTickets = Status & {
  tickets: TicketWithRelations[];
  nextCursor?: string | null;
};

export type ProjectSummary = Pick<
  Project,
  "id" | "slug" | "name" | "color" | "description" | "localPath"
> & {
  reviewCount?: number;
  buildingCount?: number;
  blockedCount?: number;
};

export type BoardData = {
  project: Project;
  statuses: StatusWithTickets[];
  allProjects: ProjectSummary[];
};

export type WorkspaceMembership = Member & { workspace: Workspace };

export type AgentProfileSummary = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

export type AgentProfileFull = AgentProfileSummary & { body: string };

export type TicketAgentProfileLink = {
  agentProfileId: string;
  position: number;
  profile: AgentProfileSummary;
};

export type AblyChannelEvent =
  | {
      name: "ticket.created";
      ticketId: string;
      workspaceId: string;
      projectId: string;
      ticket: TicketWithRelations;
      by: string;
    }
  | {
      name: "ticket.moved";
      ticketId: string;
      workspaceId: string;
      projectId: string;
      fromStatusId: string;
      toStatusId: string;
      // Destination status key (e.g. "blocked", "building"). Set by mutators
      // that know the key — chat panels react to specific keys without an
      // extra lookup. Optional because legacy publishers may only carry the id.
      toStatusKey?: string;
      position: number;
      by: string;
      // Set when moving to Completed via merge (webhook or in-app merge): the
      // worktree path + branch from the most recent AgentJob/PR record. The
      // desktop renderer uses these to fire the cleanup IPC. Optional so other
      // ticket.moved publishers (manual DnD, status picker) don't have to
      // populate them.
      cleanup?: {
        worktreePath: string;
        branch: string | null;
      } | null;
      // Why the transition was published. Subscribers that would otherwise
      // interpret a move out of `building` as a user-driven stop (e.g. the
      // agent panel SIGTERMing the live session) must NOT do so when the
      // reason marks a server-initiated end-of-step transition.
      //   - "step-ship": `pbq ship` moved Building → Review while the same
      //     Claude process is mid-clean-exit (PLAN-S2Q8SX, forensics
      //     PLAN-HOQTXA / PLAN-N4THY7).
      // Optional; legacy publishers omit it.
      reason?: "step-ship";
    }
  | {
      name: "ticket.updated";
      ticketId: string;
      workspaceId: string;
      projectId: string;
      ticket: TicketWithRelations;
      by: string;
    }
  | {
      name: "ticket.archived";
      ticketId: string;
      workspaceId: string;
      projectId: string;
      by: string;
    }
  | {
      name: "ticket.unarchived";
      ticketId: string;
      workspaceId: string;
      projectId: string;
      ticket: TicketWithRelations;
      by: string;
    }
  | {
      name: "ticket.deleted";
      ticketId: string;
      workspaceId: string;
      projectId: string;
      statusId: string;
      by: string;
    }
  | {
      name: "project.created";
      workspaceId: string;
      project: Project;
      by: string;
    }
  | {
      name: "project.updated";
      workspaceId: string;
      project: Project;
      by: string;
    }
  | {
      name: "project.deleted";
      workspaceId: string;
      projectId: string;
      slug: string;
      by: string;
    }
  | {
      name: "comment.created";
      workspaceId: string;
      projectId: string;
      ticketId: string;
      comment: {
        id: string;
        body: string;
        authorId: string;
        createdAt: Date;
        author: { id: string; name: string | null; email: string; image: string | null } | null;
      };
      by: string;
    }
  | {
      name: "comment.updated";
      workspaceId: string;
      projectId: string;
      ticketId: string;
      comment: {
        id: string;
        body: string;
        authorId: string;
        updatedAt: Date;
        author: { id: string; name: string | null; email: string; image: string | null } | null;
      };
      by: string;
    }
  | {
      name: "comment.deleted";
      workspaceId: string;
      projectId: string;
      ticketId: string;
      commentId: string;
      by: string;
    }
  | {
      name: "ticket.preview.added";
      workspaceId: string;
      ticketId: string;
      previewId: string;
      attachmentId: string;
      url: string;
      mimeType: string;
      label: string | null;
      position: number;
      by: string;
    }
  | {
      name: "ticket.screenshots.started";
      workspaceId: string;
      ticketId: string;
      total: number;
      by: string;
    }
  | {
      name: "ticket.screenshots.progress";
      workspaceId: string;
      ticketId: string;
      done: number;
      total: number;
      label: string | null;
    }
  | {
      name: "ticket.screenshots.failed";
      workspaceId: string;
      ticketId: string;
      reason: string;
    }
  | {
      name: "ticket.preview.removed";
      workspaceId: string;
      ticketId: string;
      previewId: string;
      by: string;
    }
  | {
      name: "ticket.workflow.run";
      workspaceId: string;
      ticketId: string;
    }
  | {
      // Server-driven workflow chaining. Published by the Inngest function
      // `workflow-step-completed` after a WorkflowStepRun transitions to
      // SUCCEEDED and there's another PENDING step on the same run. The
      // agent panel consumes this and dispatches the next prompt to the
      // local Claude Code bridge — replaces the renderer-side pendingSteps
      // queue, which evaporated on dialog close / refresh / crash.
      name: "ticket.workflow.dispatch";
      workspaceId: string;
      ticketId: string;
      runId: string;
      stepRunId: string;
      stepName: string;
      position: number;
      total: number;
      prompt: string;
    }
  | {
      // Published by workflow-commander when `dispatchNextStep` finalizes a
      // WorkflowRun → SUCCEEDED (no PENDING steps left, all SUCCEEDED). The
      // workspace-level desktop listener consumes this and calls
      // `bridge.agentStop` for each session so the idle Claude CLI children
      // exit instead of heartbeating forever — see PLAN-RPL4OB. Server also
      // CAS-reaps any AgentJob still RUNNING for the run before publishing,
      // so DB cleanup is guaranteed even with no desktop subscriber.
      name: "ticket.workflow.completed";
      workspaceId: string;
      ticketId: string;
      runId: string;
      sessionIds: string[];
    }
  | {
      name: "ticket.activity";
      workspaceId: string;
      ticketId: string;
      activity: {
        id: string;
        kind:
          | "PR_CREATED"
          | "PR_MERGED"
          | "COMMIT_PUSHED"
          | "TEST_RUN"
          | "BUILD"
          | "NOTE"
          | "STATUS_CHANGED"
          | "STEP_STARTED"
          | "STEP_COMPLETED";
        payload: Record<string, unknown>;
        jobId: string | null;
        createdAt: string;
      };
    }
  | {
      name: "agentProfile.created";
      workspaceId: string;
      profile: AgentProfileSummary;
      by: string;
    }
  | {
      name: "agentProfile.updated";
      workspaceId: string;
      profile: AgentProfileSummary;
      by: string;
    }
  | {
      name: "agentProfile.deleted";
      workspaceId: string;
      profileId: string;
      by: string;
    }
  | {
      name: "ticket.agentProfiles.updated";
      workspaceId: string;
      ticketId: string;
      profileIds: string[];
      by: string;
    }
  | {
      name: "agent.delta";
      workspaceId: string;
      ticketId: string;
      jobId: string;
      kind: "PLAN" | "EXECUTE" | "CHAT";
      appendOutput?: string;
      status?: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";
    }
  | {
      name: "message.created";
      workspaceId: string;
      conversationId: string;
      ticketId: string | null;
      message: MessageEventPayload;
      by: string;
    }
  | {
      name: "message.updated";
      workspaceId: string;
      conversationId: string;
      ticketId: string | null;
      messageId: string;
      // For streaming: chunks since lastSeenSequence. Null body means body
      // hasn't been finalized yet — clients should reassemble from chunks.
      body?: string;
      status?: "PENDING" | "STREAMING" | "COMPLETE" | "ERROR";
      chunks?: { sequence: number; delta: string }[];
      latestSequence?: number;
    };

export type MessageEventPayload = {
  id: string;
  conversationId: string;
  workspaceId: string;
  role: "USER" | "AGENT" | "SYSTEM";
  status: "PENDING" | "STREAMING" | "COMPLETE" | "ERROR";
  body: string;
  authorUserId: string | null;
  authorAgentId: string | null;
  agentJobId: string | null;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  authorUser: { id: string; name: string | null; email: string; image: string | null } | null;
  authorAgent: { id: string; name: string } | null;
  mentions: { id: string; targetType: "USER" | "AGENT" | "TICKET"; targetId: string }[];
};

export type ServerActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
