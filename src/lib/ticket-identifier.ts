// Canonical Planbooq ticket identifier: <PROJECTSLUG[0:4]>-<TICKETID[-6:]>, uppercased.
// Example: project "fredrin" + cuid "cmomc0aff000204jpvv0p7jub" → "FRED-0P7JUB".

export function formatTicketIdentifier(
  projectSlug: string | null | undefined,
  ticketId: string,
): string {
  const prefix = (projectSlug ?? "").slice(0, 4).toUpperCase() || "TKT";
  const suffix = ticketId.slice(-6).toUpperCase();
  return `${prefix}-${suffix}`;
}

type ParsedTicketRef =
  | { kind: "canonical"; projectPrefix: string; idSuffix: string }
  | { kind: "id_prefix"; idPrefix: string };

// Matches both:
//   - canonical: "FRED-0P7JUB"   (1–8 alnum prefix, exactly 6 alnum suffix)
//   - cuid-prefix: "pbq-cmomc0af" (1–8 alnum prefix, 7+ alnum suffix — first N chars of ticket id)
const REF_RE = /^([A-Za-z0-9]{1,8})-([A-Za-z0-9]+)$/;

export function parseTicketRef(raw: string): ParsedTicketRef | null {
  const m = raw.match(REF_RE);
  if (!m?.[1] || !m[2]) return null;
  const suffix = m[2];
  if (suffix.length === 6) {
    return { kind: "canonical", projectPrefix: m[1].toLowerCase(), idSuffix: suffix.toLowerCase() };
  }
  if (suffix.length >= 7) {
    return { kind: "id_prefix", idPrefix: suffix.toLowerCase() };
  }
  return null;
}
