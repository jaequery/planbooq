import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  assertWorkspaceAccess,
  jsonErr,
  jsonOk,
  mapErrorToStatus,
  requireCaller,
} from "@/server/api-auth";
import { prisma } from "@/server/db";

type Ctx = { params: Promise<{ workspaceId: string }> };

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const CreateLabelSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(32)
      .transform((s) => s.trim())
      .refine((s) => s.length > 0, "name_empty"),
    color: z.string().refine((c) => HEX_COLOR.test(c), "invalid_color"),
  })
  .strict();

export async function GET(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { workspaceId } = await ctx.params;
  const denied = await assertWorkspaceAccess(caller, workspaceId);
  if (denied) return denied;
  const labels = await prisma.label.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
  });
  return jsonOk(labels);
}

export async function POST(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { workspaceId } = await ctx.params;
  const denied = await assertWorkspaceAccess(caller, workspaceId);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const parsed = CreateLabelSchema.safeParse(body);
  if (!parsed.success) return jsonErr("validation_error", 400);
  try {
    const label = await prisma.label.create({
      data: { workspaceId, name: parsed.data.name, color: parsed.data.color },
    });
    return jsonOk(label, { status: 201 });
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as { code?: string }).code === "P2002") {
      return jsonErr("label_name_taken", mapErrorToStatus("label_name_taken"));
    }
    logger.error("api.label.create.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return jsonErr("unknown", 500);
  }
}
