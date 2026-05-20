// Parse a free-text assistant message for clickable suggested-reply chips.
//
// Conservative on purpose — we'd rather miss the chance to render chips than
// surface bogus ones on a message that wasn't actually a choice prompt. The
// caller (chat composer UI) renders nothing when the result is empty, which
// degrades gracefully to the existing text composer.
//
// Two patterns yield chips:
//   1. A trailing bullet/numbered list (≥2 items) when the message tail also
//      contains a question mark or an explicit choice phrase. The "tail"
//      tolerates exactly one closing question line after the list.
//   2. A binary yes/no question — message ends with `?` AND contains a
//      should-I / do-you-want / shall-I / approve / proceed style phrase.
//
// Returns at most MAX_CHIPS items, deduplicated case-insensitively.

export type SuggestedReply = {
  /** Text rendered on the chip. */
  label: string;
  /** Text submitted as the user reply when the chip is clicked. */
  value: string;
};

const MAX_CHIPS = 5;
const MAX_LABEL_CHARS = 80;

const STRIP_FENCED_CODE = /```[\s\S]*?```/g;
// Bullet (-, *, •) OR ordered (1. / 1) / a. / A)) followed by a space.
const LIST_LINE = /^[ \t]*(?:[-*•]|(?:\d+|[A-Za-z])[.)])\s+(.+?)\s*$/;

function trimMarkdownEmphasis(s: string): string {
  // Strip surrounding **, *, __, _, ` so chip labels read cleanly.
  return s
    .replace(/^[*_`]+/, "")
    .replace(/[*_`]+$/, "")
    .trim();
}

function shortenLabel(raw: string): string | null {
  const trimmed = trimMarkdownEmphasis(raw);
  if (!trimmed) return null;
  if (trimmed.length <= MAX_LABEL_CHARS) return trimmed;
  // Prefer cutting at the first ":" or " — " — that's where the agent
  // separates the option name from its rationale.
  const breakpoints = [trimmed.indexOf(":"), trimmed.indexOf(" — ")].filter(
    (i) => i > 0 && i <= MAX_LABEL_CHARS,
  );
  if (breakpoints.length > 0) {
    const cut = Math.min(...breakpoints);
    return trimmed.slice(0, cut).trim();
  }
  // Otherwise truncate at a word boundary so the chip doesn't dangle.
  const clipped = trimmed.slice(0, MAX_LABEL_CHARS - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return lastSpace > MAX_LABEL_CHARS / 2 ? `${clipped.slice(0, lastSpace)}…` : `${clipped}…`;
}

function dedupe(replies: SuggestedReply[]): SuggestedReply[] {
  const seen = new Set<string>();
  const out: SuggestedReply[] = [];
  for (const r of replies) {
    const key = r.value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

// Walk lines bottom-up and collect a trailing run of list items. Tolerates a
// single non-list closing question line ("Which would you like?") AND blank
// lines between list items.
function collectTrailingListItems(lines: string[]): string[] {
  let i = lines.length - 1;
  while (i >= 0 && lines[i]!.trim() === "") i--;
  if (i < 0) return [];

  // If the last non-blank line is not a list line but ends with "?", walk past
  // it — that's the agent's closing question after the bullets.
  if (!LIST_LINE.test(lines[i]!) && /\?\s*$/.test(lines[i]!.trim())) {
    i--;
    while (i >= 0 && lines[i]!.trim() === "") i--;
  }

  const items: string[] = [];
  while (i >= 0) {
    const line = lines[i]!;
    if (line.trim() === "") {
      // Blank line — only continue the run if the next non-blank line is also
      // a list item. Otherwise the list ended above.
      let j = i - 1;
      while (j >= 0 && lines[j]!.trim() === "") j--;
      if (j >= 0 && LIST_LINE.test(lines[j]!)) {
        i = j;
        continue;
      }
      break;
    }
    const m = line.match(LIST_LINE);
    if (!m) break;
    items.unshift(m[1]!);
    i--;
  }
  return items;
}

export function suggestedRepliesFor(body: string): SuggestedReply[] {
  if (!body) return [];
  const stripped = body.replace(STRIP_FENCED_CODE, "").trim();
  if (!stripped) return [];

  const lines = stripped.split(/\r?\n/);
  // Cap parsing scope to the last 25 lines so a stray bullet list buried at
  // the top of a long answer doesn't get promoted into chips.
  const tail = lines.slice(-25);
  const tailText = tail.join("\n");

  const listItems = collectTrailingListItems(tail);
  if (listItems.length >= 2 && listItems.length <= MAX_CHIPS) {
    const isChoicePrompt =
      /\?/.test(tailText) ||
      /\b(pick (one|a|an option)|choose|which (one|option|approach|do you)|select one|let me know which|tell me which|prefer)\b/i.test(
        tailText,
      );
    if (isChoicePrompt) {
      const replies: SuggestedReply[] = [];
      for (const raw of listItems) {
        const label = shortenLabel(raw);
        if (!label) continue;
        replies.push({ label, value: label });
      }
      const deduped = dedupe(replies);
      if (deduped.length >= 2) return deduped.slice(0, MAX_CHIPS);
    }
  }

  // Binary yes/no fallback. Last 400 chars of the message must contain a
  // recognisable binary-question phrase AND the message must end on "?".
  const endsOnQuestion = /\?\s*$/.test(stripped);
  const binaryTail = stripped.slice(-400);
  const isBinary =
    endsOnQuestion &&
    /\b(should i|do you want|shall i|would you like|ok to|okay to|is it ok|is that ok|are you sure|confirm|approve|proceed)\b/i.test(
      binaryTail,
    );
  if (isBinary) {
    return [
      { label: "Yes", value: "Yes" },
      { label: "No", value: "No" },
    ];
  }

  return [];
}
