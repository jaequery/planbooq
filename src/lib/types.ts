import type { Member, Role, Status, Ticket, User, Workspace } from "@prisma/client";

export type { Member, Role, Status, Ticket, User, Workspace };

export type StatusWithTickets = Status & { tickets: Ticket[] };

export type BoardData = {
  workspace: Workspace;
  statuses: StatusWithTickets[];
};

export type WorkspaceMembership = Member & { workspace: Workspace };

export type AblyChannelEvent =
  | {
      name: "ticket.created";
      ticketId: string;
      workspaceId: string;
      ticket: Ticket;
      by: string;
    }
  | {
      name: "ticket.moved";
      ticketId: string;
      workspaceId: string;
      fromStatusId: string;
      toStatusId: string;
      position: number;
      by: string;
    };

export type ServerActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
