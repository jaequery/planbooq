import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listWorkflowTemplates } from "@/actions/workflow";
import { AgentProfilesClient } from "@/components/settings/agent-profiles-client";
import { AgentsClient } from "@/components/settings/agents-client";
import { ApiKeysClient } from "@/components/settings/api-keys-client";
import { AppearancePicker } from "@/components/settings/appearance-picker";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { WorkflowsClient } from "@/components/settings/workflows-client";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export async function SettingsContent(): Promise<React.ReactElement | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id },
    select: { workspaceId: true, workspace: { select: { name: true, slug: true } } },
  });
  if (!membership) notFound();

  const agents = await prisma.agent.findMany({
    where: { workspaceId: membership.workspaceId, userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      hostname: true,
      platform: true,
      lastSeenAt: true,
      createdAt: true,
      revokedAt: true,
    },
  });

  const wfList = await listWorkflowTemplates({ workspaceId: membership.workspaceId });
  const initialTemplates = wfList.ok ? wfList.templates : [];

  const agentProfiles = await prisma.agentProfile.findMany({
    where: { workspaceId: membership.workspaceId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      slug: true,
      description: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      archivedAt: true,
    },
  });

  const keys = await prisma.apiKey.findMany({
    where: { workspaceId: membership.workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  return (
    <Suspense fallback={null}>
      <SettingsTabs
        appearance={
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold">Appearance</h2>
              <p className="text-sm text-muted-foreground">
                Choose how Planbooq looks. System follows your device setting.
              </p>
            </div>
            <AppearancePicker />
          </section>
        }
        apiKeys={
          <ApiKeysClient
            workspaceId={membership.workspaceId}
            workspaceName={membership.workspace.name}
            initialKeys={keys}
          />
        }
        workflows={
          <WorkflowsClient
            workspaceId={membership.workspaceId}
            initialTemplates={initialTemplates}
          />
        }
        agents={
          <AgentProfilesClient
            workspaceId={membership.workspaceId}
            initialProfiles={agentProfiles}
          />
        }
        localAgents={<AgentsClient workspaceId={membership.workspaceId} initialAgents={agents} />}
      />
    </Suspense>
  );
}
