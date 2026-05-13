export type DecodedKeysetCursor = {
  createdAt: Date;
  id: string;
};

export function encodeKeysetCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

export function decodeKeysetCursor(cursor: string | null | undefined): DecodedKeysetCursor | null {
  if (!cursor) return null;
  const [iso, id] = cursor.split("|");
  if (!iso || !id) return null;
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}
