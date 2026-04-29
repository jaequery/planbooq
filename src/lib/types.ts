import type {
  Label,
  Member,
  Priority,
  Project,
  Role,
  Status,
  Ticket,
  User,
  Workspace,
} from "@prisma/client";

export type { Label, Member, Priority, Project, Role, Status, Ticket, User, Workspace };

export type TicketAssignee = Pick<User, "id" | "name" | "email" | "image">;
export type TicketLabel = Pick<Label, "id" | "name" | "color">;

export type TicketWithRelations = Ticket & {
  assignee?: TicketAssignee | null;
  labels?: TicketLabel[];
};

export type StatusWithTickets = Status & { tickets: TicketWithRelations[] };

export type ProjectSummary = Pick<Project, "id" | "slug" | "name" | "color">;

export type BoardData = {
  project: Project;
  statuses: StatusWithTickets[];
  allProjects: ProjectSummary[];
};

export type WorkspaceMembership = Member & { workspace: Workspace };

export type AblyChannelEvent =
  | {
      name: "ticket.created";
      ticketId: string;
      workspaceId: string;
      projectId: string;
      ticket: Ticket;
      by: string;
    }
  | {
      name: "ticket.moved";
      ticketId: string;
      workspaceId: string;
      projectId: string;
      fromStatusId: string;
      toStatusId: string;
      position: number;
      by: string;
    }
  | {
      name: "ticket.updated";
      ticketId: string;
      workspaceId: string;
      projectId: string;
      ticket: Ticket;
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
      name: "project.created";
      workspaceId: string;
      project: Project;
      by: string;
    };

export type ServerActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
