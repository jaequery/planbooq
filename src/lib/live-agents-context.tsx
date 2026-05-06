"use client";

import { createContext, useContext } from "react";

export type LiveAgentState = {
  jobId: string;
  kind: "PLAN" | "EXECUTE" | "CHAT";
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";
  lastLine: string | null;
};

/** ticketId -> latest live agent activity. Provided by Board, consumed by TicketCard. */
export const LiveAgentsContext = createContext<ReadonlyMap<string, LiveAgentState>>(new Map());

export function useLiveAgent(ticketId: string): LiveAgentState | undefined {
  return useContext(LiveAgentsContext).get(ticketId);
}
