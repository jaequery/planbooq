export type LiveAgentJob = {
  ticketId: string;
  status: string;
  createdAt: Date | string;
};

function isPreferredLiveJob<T extends LiveAgentJob>(candidate: T, current: T): boolean {
  if (candidate.status === "RUNNING" && current.status !== "RUNNING") return true;
  if (candidate.status !== "RUNNING" && current.status === "RUNNING") return false;
  return +new Date(candidate.createdAt) > +new Date(current.createdAt);
}

export function selectAuthoritativeLiveJobs<T extends LiveAgentJob>(jobs: T[]): T[] {
  const latestByTicket = new Map<string, T>();
  for (const job of jobs) {
    const current = latestByTicket.get(job.ticketId);
    if (!current || isPreferredLiveJob(job, current)) {
      latestByTicket.set(job.ticketId, job);
    }
  }
  return Array.from(latestByTicket.values());
}
