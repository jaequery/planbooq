// Default statuses for a freshly provisioned Planbooq workspace.
// Mirrors the README's default workflow.

export type DefaultStatusSeed = {
  key: string;
  name: string;
  color: string;
  position: number;
};

export const DEFAULT_STATUSES: ReadonlyArray<DefaultStatusSeed> = [
  { key: "backlog", name: "Backlog", color: "#94a3b8", position: 1 },
  { key: "todo", name: "Todo", color: "#64748b", position: 2 },
  { key: "building", name: "Building", color: "#f59e0b", position: 3 },
  { key: "review", name: "Review", color: "#3b82f6", position: 4 },
  { key: "completed", name: "Completed", color: "#22c55e", position: 5 },
];
