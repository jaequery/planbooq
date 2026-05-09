// Canonical worktree folder name: `[project].[ticket#]`.
// Project is the repo basename; ticket# is the Planbooq ticket identifier
// (e.g. "PLAN-AYJWUI"). Both segments must be filesystem-safe and non-empty
// so the resulting path is unambiguous and easy to spot in `ls`.

const SEGMENT_RE = /^[A-Za-z0-9_-]{1,64}$/;

export class WorktreeNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorktreeNameError";
  }
}

export function formatWorktreeName(project: string, ticketIdentifier: string): string {
  if (!project || !SEGMENT_RE.test(project)) {
    throw new WorktreeNameError(
      `invalid project segment "${project}": expected 1-64 chars matching [A-Za-z0-9_-]`,
    );
  }
  if (!ticketIdentifier || !SEGMENT_RE.test(ticketIdentifier)) {
    throw new WorktreeNameError(
      `invalid ticket segment "${ticketIdentifier}": expected 1-64 chars matching [A-Za-z0-9_-] (e.g. "PLAN-AYJWUI")`,
    );
  }
  return `${project}.${ticketIdentifier}`;
}
