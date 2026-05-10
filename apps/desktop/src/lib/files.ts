import { ipcMain } from "electron";
import crypto from "node:crypto";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

// Allow only files within the picked project root, with a known basename.
// Relative paths only — no traversal, no absolute, no symlink targets outside.
function safeJoin(root: string, rel: string): string | null {
  if (!root || !rel) return null;
  if (path.isAbsolute(rel) || rel.includes("..")) return null;
  const full = path.normalize(path.join(root, rel));
  const rooted = path.resolve(root);
  const target = path.resolve(full);
  if (!target.startsWith(`${rooted}${path.sep}`) && target !== rooted) return null;
  return target;
}

export function registerFilesIpc(): void {
  ipcMain.handle(
    "planbooq:files:read",
    async (_, input: { repoPath: string; relPath: string }) => {
      const target = safeJoin(input?.repoPath ?? "", input?.relPath ?? "");
      if (!target) return { ok: false, error: "invalid_path" };
      try {
        const content = await fs.readFile(target, "utf8");
        return { ok: true, content, exists: true };
      } catch (err: unknown) {
        const code = (err as { code?: string }).code;
        if (code === "ENOENT") return { ok: true, content: "", exists: false };
        return { ok: false, error: code ?? "read_failed" };
      }
    },
  );

  ipcMain.handle(
    "planbooq:files:saveClipboardImage",
    async (_, input: { dataBase64: string; ext: string }) => {
      const ext = (input?.ext ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 5);
      if (!ext) return { ok: false, error: "invalid_ext" };
      if (typeof input?.dataBase64 !== "string" || input.dataBase64.length === 0) {
        return { ok: false, error: "invalid_data" };
      }
      try {
        const dir = path.join(os.tmpdir(), "planbooq-paste");
        await fs.mkdir(dir, { recursive: true });
        const name = `paste-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
        const target = path.join(dir, name);
        const buf = Buffer.from(input.dataBase64, "base64");
        await fs.writeFile(target, buf);
        return { ok: true, path: target };
      } catch (err: unknown) {
        const code = (err as { code?: string }).code;
        return { ok: false, error: code ?? "save_failed" };
      }
    },
  );

  ipcMain.handle(
    "planbooq:files:write",
    async (_, input: { repoPath: string; relPath: string; content: string }) => {
      const target = safeJoin(input?.repoPath ?? "", input?.relPath ?? "");
      if (!target) return { ok: false, error: "invalid_path" };
      if (typeof input.content !== "string") return { ok: false, error: "invalid_content" };
      try {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, input.content, "utf8");
        return { ok: true };
      } catch (err: unknown) {
        const code = (err as { code?: string }).code;
        return { ok: false, error: code ?? "write_failed" };
      }
    },
  );

  ipcMain.handle(
    "planbooq:files:writeAttachments",
    async (
      _,
      input: {
        worktreePath: string;
        items: Array<{ id: string; ext: string; base64: string }>;
      },
    ) => {
      const r = await writeAttachmentsToWorktree(
        input?.worktreePath ?? "",
        input?.items ?? [],
      );
      return r;
    },
  );
}

// Materialize attachments under <worktree>/.planbooq/attachments/<id>.<ext>
// so the Claude subprocess can `Read` them as plain files instead of fetching
// HTTP URLs that require browser session auth. Exported so the agent IPC can
// call it directly during cold start (between worktree creation and the first
// claude spawn) without bouncing through the renderer.
export async function writeAttachmentsToWorktree(
  worktreePath: string,
  items: Array<{ id: string; ext: string; base64: string }>,
): Promise<{ ok: true; items: Array<{ id: string; relPath: string }> } | { ok: false; error: string }> {
  if (!worktreePath || !path.isAbsolute(worktreePath)) {
    return { ok: false, error: "invalid_path" };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: true, items: [] };
  }
  try {
    const dir = path.join(worktreePath, ".planbooq", "attachments");
    await fs.mkdir(dir, { recursive: true });
    const written: Array<{ id: string; relPath: string }> = [];
    for (const item of items) {
      if (!item || typeof item.id !== "string" || typeof item.base64 !== "string") continue;
      const safeId = item.id.replace(/[^a-z0-9_-]/gi, "");
      const safeExt = (item.ext ?? "")
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase()
        .slice(0, 5) || "bin";
      if (!safeId) continue;
      const filename = `${safeId}.${safeExt}`;
      const full = path.join(dir, filename);
      // Defense-in-depth: ensure no escape from the attachments dir.
      const resolved = path.resolve(full);
      if (!resolved.startsWith(`${path.resolve(dir)}${path.sep}`)) continue;
      await fs.writeFile(full, Buffer.from(item.base64, "base64"));
      written.push({ id: safeId, relPath: path.posix.join(".planbooq", "attachments", filename) });
    }
    return { ok: true, items: written };
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    return { ok: false, error: code ?? "write_failed" };
  }
}
