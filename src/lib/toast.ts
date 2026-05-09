import { toast } from "sonner";

const ERROR_MESSAGES: Record<string, string> = {
  duplicate_title: "A ticket with that title already exists.",
  forbidden: "You don't have permission to do that.",
  github_error: "GitHub request failed. Try again in a moment.",
  id_mismatch: "That item no longer matches — refresh and try again.",
  invalid_assignee: "That person isn't a member of this workspace.",
  invalid_label: "That label doesn't belong to this project.",
  invalid_project: "That project is no longer available.",
  invalid_slug: "That slug isn't valid.",
  invalid_status: "That status isn't available on this board.",
  label_name_taken: "A label with that name already exists.",
  missing_scope: "Planbooq needs additional GitHub permissions.",
  no_agent_paired: "No agent is paired for this project.",
  no_backlog_status: "This project has no backlog column configured.",
  no_changes: "Nothing to update.",
  no_github: "Connect your GitHub account first.",
  no_pr_url: "No pull request URL was provided.",
  no_workspace: "No workspace selected.",
  not_found: "That item couldn't be found.",
  not_github: "This project isn't linked to a GitHub repository.",
  rate_limited: "GitHub rate limit hit — try again in a minute.",
  slug_taken: "That slug is already in use.",
  template_not_found: "That workflow template no longer exists.",
  ticket_archived: "This ticket has been archived.",
  ticket_not_found: "That ticket couldn't be found.",
  unauthorized: "Please sign in to continue.",
  unknown: "Something went wrong. Try again.",
};

export function friendlyError(code: string | undefined | null): string {
  const fallback = ERROR_MESSAGES.unknown ?? "Something went wrong.";
  if (!code) return fallback;
  return ERROR_MESSAGES[code] ?? code.replace(/_/g, " ");
}

type ServerActionResult<T> = { ok: true; data?: T } | { ok: false; error: string };

type ToastResultOptions<T> = {
  success?: string | ((data: T | undefined) => string);
  errorPrefix?: string;
};

export function toastResult<T>(
  result: ServerActionResult<T>,
  opts: ToastResultOptions<T> = {},
): boolean {
  if (result.ok) {
    if (opts.success) {
      const message = typeof opts.success === "function" ? opts.success(result.data) : opts.success;
      toast.success(message);
    }
    return true;
  }
  const friendly = friendlyError(result.error);
  toast.error(opts.errorPrefix ? `${opts.errorPrefix}: ${friendly}` : friendly);
  return false;
}

export { toast };
