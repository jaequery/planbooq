import { NextResponse } from "next/server";
import { resolveCaller, type AuthedCaller } from "@/server/api-auth";
import { prisma } from "@/server/db";
import {
  createCommentSvc,
  deleteCommentSvc,
  listTicketCommentsSvc,
  updateCommentSvc,
} from "@/server/services/comments";
import {
  createProjectSvc,
  deleteProjectSvc,
  updateProjectSvc,
} from "@/server/services/projects";
import {
  createTicketSvc,
  getTicketSvc,
  listProjectTicketsSvc,
  moveTicketSvc,
  updateTicketSvc,
} from "@/server/services/tickets";

export const runtime = "nodejs";
export const maxDuration = 30;

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "planbooq", version: "0.1.0" };

type JsonRpcReq = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (caller: AuthedCaller, args: Record<string, unknown>) => Promise<unknown>;
};

function obj(props: Record<string, unknown>, required: string[] = []) {
  return { type: "object", properties: props, required, additionalProperties: false };
}
const str = { type: "string" };
const strOpt = { type: ["string", "null"] };

async function assertWorkspace(caller: AuthedCaller, workspaceId: string) {
  if (caller.workspaceScope && caller.workspaceScope !== workspaceId) {
    throw new Error("forbidden");
  }
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: caller.userId } },
  });
  if (!member) throw new Error("forbidden");
}

const TOOLS: ToolDef[] = [
  {
    name: "list_workspaces",
    description: "List workspaces the caller can access. If the API key is workspace-scoped, returns only that workspace.",
    inputSchema: obj({}),
    handler: async (caller) => {
      const where = caller.workspaceScope
        ? { id: caller.workspaceScope }
        : { members: { some: { userId: caller.userId } } };
      return prisma.workspace.findMany({
        where,
        select: { id: true, name: true, slug: true },
        orderBy: { createdAt: "asc" },
      });
    },
  },
  {
    name: "list_projects",
    description: "List projects in a workspace.",
    inputSchema: obj({ workspaceId: str }, ["workspaceId"]),
    handler: async (caller, a) => {
      const workspaceId = String(a.workspaceId);
      await assertWorkspace(caller, workspaceId);
      return prisma.project.findMany({
        where: { workspaceId },
        select: { id: true, name: true, slug: true, position: true },
        orderBy: { position: "asc" },
      });
    },
  },
  {
    name: "create_project",
    description: "Create a project in a workspace. Color must be a #rrggbb hex string.",
    inputSchema: obj(
      {
        workspaceId: str,
        name: str,
        color: str,
        slug: strOpt,
        description: strOpt,
        repoUrl: strOpt,
        techStack: strOpt,
      },
      ["workspaceId", "name", "color"],
    ),
    handler: async (caller, a) => {
      const r = await createProjectSvc(caller.userId, {
        workspaceId: String(a.workspaceId),
        name: String(a.name),
        color: String(a.color),
        slug: a.slug ? String(a.slug) : undefined,
        description: a.description ? String(a.description) : undefined,
        repoUrl: a.repoUrl ? String(a.repoUrl) : undefined,
        techStack: a.techStack ? String(a.techStack) : undefined,
      });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  },
  {
    name: "update_project",
    description: "Update project fields (name, slug, color, description, repoUrl, techStack).",
    inputSchema: obj(
      {
        projectId: str,
        name: strOpt,
        slug: strOpt,
        color: strOpt,
        description: strOpt,
        repoUrl: strOpt,
        techStack: strOpt,
      },
      ["projectId"],
    ),
    handler: async (caller, a) => {
      const patch: Record<string, unknown> = {};
      if (a.name !== undefined) patch.name = a.name;
      if (a.slug !== undefined) patch.slug = a.slug;
      if (a.color !== undefined) patch.color = a.color;
      if (a.description !== undefined) patch.description = a.description;
      if (a.repoUrl !== undefined) patch.repoUrl = a.repoUrl;
      if (a.techStack !== undefined) patch.techStack = a.techStack;
      const r = await updateProjectSvc(caller.userId, String(a.projectId), patch);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  },
  {
    name: "delete_project",
    description: "Delete a project. This cascades to all tickets in the project.",
    inputSchema: obj({ projectId: str }, ["projectId"]),
    handler: async (caller, a) => {
      const r = await deleteProjectSvc(caller.userId, String(a.projectId));
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  },
  {
    name: "list_statuses",
    description: "List kanban statuses (columns) in a workspace.",
    inputSchema: obj({ workspaceId: str }, ["workspaceId"]),
    handler: async (caller, a) => {
      const workspaceId = String(a.workspaceId);
      await assertWorkspace(caller, workspaceId);
      return prisma.status.findMany({
        where: { workspaceId },
        select: { id: true, name: true, key: true, position: true, color: true },
        orderBy: { position: "asc" },
      });
    },
  },
  {
    name: "list_tickets",
    description: "List tickets in a project, optionally filtered by status or assignee.",
    inputSchema: obj(
      {
        projectId: str,
        statusId: strOpt,
        assigneeId: strOpt,
        includeArchived: { type: "boolean" },
        cursor: strOpt,
        limit: { type: "number" },
      },
      ["projectId"],
    ),
    handler: async (caller, a) => {
      const r = await listProjectTicketsSvc(caller.userId, String(a.projectId), {
        statusId: a.statusId ? String(a.statusId) : undefined,
        assigneeId: a.assigneeId ? String(a.assigneeId) : undefined,
        includeArchived: a.includeArchived === true,
        cursor: a.cursor ? String(a.cursor) : undefined,
        limit: typeof a.limit === "number" ? a.limit : 50,
      });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  },
  {
    name: "get_ticket",
    description: "Fetch a single ticket by id.",
    inputSchema: obj({ ticketId: str }, ["ticketId"]),
    handler: async (caller, a) => {
      const r = await getTicketSvc(caller.userId, String(a.ticketId));
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  },
  {
    name: "create_ticket",
    description: "Create a ticket in a project under a status.",
    inputSchema: obj(
      {
        projectId: str,
        statusId: str,
        title: str,
        description: { type: ["string", "null"] },
      },
      ["projectId", "statusId", "title"],
    ),
    handler: async (caller, a) => {
      const r = await createTicketSvc(caller.userId, {
        projectId: String(a.projectId),
        statusId: String(a.statusId),
        title: String(a.title),
        description: a.description ? String(a.description) : undefined,
      });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  },
  {
    name: "update_ticket",
    description: "Update ticket fields (title, description, priority, assignee, due date, labels).",
    inputSchema: obj(
      {
        ticketId: str,
        title: strOpt,
        description: strOpt,
        priority: { type: ["string", "null"], enum: ["LOW", "MEDIUM", "HIGH", "URGENT", null] },
        assigneeId: strOpt,
        dueDate: strOpt,
        labelIds: { type: "array", items: str },
      },
      ["ticketId"],
    ),
    handler: async (caller, a) => {
      const patch: Record<string, unknown> = {};
      if (a.title !== undefined) patch.title = a.title;
      if (a.description !== undefined) patch.description = a.description;
      if (a.priority !== undefined) patch.priority = a.priority;
      if (a.assigneeId !== undefined) patch.assigneeId = a.assigneeId;
      if (a.dueDate !== undefined) patch.dueDate = a.dueDate;
      if (a.labelIds !== undefined) patch.labelIds = a.labelIds;
      const r = await updateTicketSvc(caller.userId, String(a.ticketId), patch);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  },
  {
    name: "move_ticket",
    description: "Move a ticket to a status, optionally between two anchor tickets for ordering.",
    inputSchema: obj(
      {
        ticketId: str,
        toStatusId: str,
        beforeTicketId: strOpt,
        afterTicketId: strOpt,
      },
      ["ticketId", "toStatusId"],
    ),
    handler: async (caller, a) => {
      const r = await moveTicketSvc(caller.userId, String(a.ticketId), {
        toStatusId: String(a.toStatusId),
        beforeTicketId: a.beforeTicketId ? String(a.beforeTicketId) : null,
        afterTicketId: a.afterTicketId ? String(a.afterTicketId) : null,
      });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  },
  {
    name: "list_comments",
    description: "List comments on a ticket, oldest first.",
    inputSchema: obj(
      { ticketId: str, cursor: strOpt, limit: { type: "number" } },
      ["ticketId"],
    ),
    handler: async (caller, a) => {
      const r = await listTicketCommentsSvc(caller.userId, String(a.ticketId), {
        cursor: a.cursor ? String(a.cursor) : undefined,
        limit: typeof a.limit === "number" ? a.limit : 50,
      });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  },
  {
    name: "create_comment",
    description: "Add a comment to a ticket. The caller is the author.",
    inputSchema: obj({ ticketId: str, body: str }, ["ticketId", "body"]),
    handler: async (caller, a) => {
      const r = await createCommentSvc(caller.userId, {
        ticketId: String(a.ticketId),
        body: String(a.body),
      });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  },
  {
    name: "update_comment",
    description: "Edit a comment's body. Only the author can edit.",
    inputSchema: obj({ commentId: str, body: str }, ["commentId", "body"]),
    handler: async (caller, a) => {
      const r = await updateCommentSvc(caller.userId, String(a.commentId), {
        body: String(a.body),
      });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  },
  {
    name: "delete_comment",
    description: "Delete a comment. Only the author can delete.",
    inputSchema: obj({ commentId: str }, ["commentId"]),
    handler: async (caller, a) => {
      const r = await deleteCommentSvc(caller.userId, String(a.commentId));
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  },
];

const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

function rpcResult(id: JsonRpcReq["id"], result: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, result };
}
function rpcError(id: JsonRpcReq["id"], code: number, message: string) {
  return { jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } };
}

async function handle(req: JsonRpcReq, caller: AuthedCaller | null) {
  switch (req.method) {
    case "initialize":
      return rpcResult(req.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return null; // notifications get no response
    case "ping":
      return rpcResult(req.id, {});
    case "tools/list":
      if (!caller) return rpcError(req.id, -32001, "unauthorized");
      return rpcResult(req.id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    case "tools/call": {
      if (!caller) return rpcError(req.id, -32001, "unauthorized");
      const params = req.params ?? {};
      const name = String(params.name ?? "");
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const tool = TOOL_MAP.get(name);
      if (!tool) return rpcError(req.id, -32602, `unknown tool: ${name}`);
      try {
        const data = await tool.handler(caller, args);
        return rpcResult(req.id, {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return rpcResult(req.id, {
          isError: true,
          content: [{ type: "text", text: msg }],
        });
      }
    }
    default:
      return rpcError(req.id, -32601, `method not found: ${req.method}`);
  }
}

export async function POST(req: Request) {
  const caller = await resolveCaller(req);
  let body: JsonRpcReq | JsonRpcReq[];
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, "parse error"), { status: 400 });
  }
  const batch = Array.isArray(body);
  const reqs: JsonRpcReq[] = batch ? (body as JsonRpcReq[]) : [body as JsonRpcReq];
  const responses = (await Promise.all(reqs.map((r) => handle(r, caller)))).filter(
    (r): r is NonNullable<typeof r> => r !== null,
  );
  if (responses.length === 0) return new NextResponse(null, { status: 202 });
  return NextResponse.json(batch ? responses : responses[0]);
}

export async function GET() {
  return NextResponse.json(rpcError(null, -32000, "method not allowed; use POST"), {
    status: 405,
  });
}
