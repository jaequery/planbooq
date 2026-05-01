import "server-only";

import { z } from "zod";
import { logger } from "@/lib/logger";
import type { ServerActionResult } from "@/lib/types";
import { prisma } from "@/server/db";
import { createProjectSvc } from "@/server/services/projects";
import { createTicketSvc } from "@/server/services/tickets";

export type AiToolName = "create_ticket" | "create_project";

export type AiPanelPageContext = {
  workspaceId: string;
  projectId?: string;
  ticketId?: string;
};

export type AiToolExecutionResult = {
  id: string;
  kind: "ticket" | "project";
  url?: string;
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const CreateTicketArgsSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    title: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
  })
  .strict();

const CreateProjectArgsSchema = z
  .object({
    name: z.string().min(1).max(80),
    color: z.string().regex(HEX_COLOR_RE, "invalid_color").optional(),
    description: z.string().max(2000).optional(),
  })
  .strict();

export const AI_PANEL_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "create_ticket",
      description:
        "Create a new ticket in a Planbooq project. `projectId` is OPTIONAL — if omitted, the user's current page context (projectId) will be used as the default. If neither is available the tool will fail with `project_required`. Title is required and brief; description is markdown.",
      parameters: {
        type: "object",
        properties: {
          projectId: {
            type: "string",
            description: "Optional. Defaults to the page context's project.",
          },
          title: { type: "string", description: "Concise imperative summary, max 200 chars." },
          description: {
            type: "string",
            description: "Optional markdown body, max 5000 chars.",
          },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_project",
      description:
        "Create a new project in the user's current workspace. Color is an optional `#RRGGBB` hex string; a sensible default is used if omitted.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Project name, max 80 chars." },
          color: {
            type: "string",
            description: "Optional `#RRGGBB` hex color.",
          },
          description: {
            type: "string",
            description: "Optional description, max 2000 chars.",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
];

export type ExecuteToolArgs = {
  userId: string;
  workspaceId: string;
  toolName: string;
  toolArgs: unknown;
  pageContext: AiPanelPageContext;
};

async function pickDefaultStatusId(workspaceId: string): Promise<string | null> {
  const status = await prisma.status.findFirst({
    where: { workspaceId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  return status?.id ?? null;
}

export async function executeTool(
  args: ExecuteToolArgs,
): Promise<ServerActionResult<AiToolExecutionResult>> {
  try {
    if (args.toolName === "create_ticket") {
      const parsed = CreateTicketArgsSchema.safeParse(args.toolArgs);
      if (!parsed.success) return { ok: false, error: "invalid_args" };
      const projectId = parsed.data.projectId ?? args.pageContext.projectId;
      if (!projectId) return { ok: false, error: "project_required" };

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, workspaceId: true, slug: true },
      });
      if (!project) return { ok: false, error: "invalid_project" };
      if (project.workspaceId !== args.workspaceId) {
        return { ok: false, error: "forbidden" };
      }

      const statusId = await pickDefaultStatusId(project.workspaceId);
      if (!statusId) return { ok: false, error: "no_default_status" };

      const result = await createTicketSvc(args.userId, {
        projectId,
        statusId,
        title: parsed.data.title,
        description: parsed.data.description,
      });
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        data: {
          id: result.data.id,
          kind: "ticket",
          url: `/p/${project.slug}/t/${result.data.id}`,
        },
      };
    }

    if (args.toolName === "create_project") {
      const parsed = CreateProjectArgsSchema.safeParse(args.toolArgs);
      if (!parsed.success) return { ok: false, error: "invalid_args" };
      const result = await createProjectSvc(args.userId, {
        workspaceId: args.workspaceId,
        name: parsed.data.name,
        color: parsed.data.color ?? "#6366f1",
        description: parsed.data.description,
      });
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        data: {
          id: result.data.id,
          kind: "project",
          url: `/p/${result.data.slug}`,
        },
      };
    }

    return { ok: false, error: "unknown_tool" };
  } catch (error) {
    logger.error("ai-panel.executeTool.failed", {
      toolName: args.toolName,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}
