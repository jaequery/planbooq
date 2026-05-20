// Render-time helpers for hiding workflow-boundary "system chrome" in chat.
//
// The server's withWorkflowStepBoundary() wraps every workflow step prompt
// with a ~25-line boilerplate block before the agent receives it. That block
// is persisted as the body of a USER Message row and would otherwise drown
// out the real conversation. These helpers identify those rows so chat
// surfaces can render a compact collapsible pill in their place.

const WORKFLOW_BOUNDARY_PREFIX = "You are executing exactly one Planbooq workflow step:";
const WORKFLOW_STEP_HEADER = /\n\[Workflow(?:\s+\d+\/\d+)?:\s*([^\]]+)\]\s*\n/;

/** True when this message body is the workflow-boundary wrapper, not real chat. */
export function isWorkflowBoundaryMessage(body: string): boolean {
  if (!body) return false;
  return body.trimStart().startsWith(WORKFLOW_BOUNDARY_PREFIX);
}

/** Extract `Plan (1/3)` style label from the boundary header for the pill. */
export function extractWorkflowStepLabel(body: string): string | null {
  const m = body.match(/Planbooq workflow step:\s*"([^"]+)"\s*\((\d+\/\d+)\)/);
  if (!m) return null;
  const [, name, position] = m;
  return `${name} (${position})`;
}

/**
 * Strip the boundary preamble so the expand-view shows only the genuine step
 * prompt the user actually wrote, not the auto-injected hard-boundary rules.
 */
export function stripWorkflowBoundary(body: string): string {
  const m = body.match(WORKFLOW_STEP_HEADER);
  if (!m || m.index === undefined) return body;
  return body.slice(m.index).trimStart();
}
