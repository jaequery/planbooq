import { ipcMain } from "electron";
import path from "node:path";
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
}
