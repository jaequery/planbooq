import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AgentsClient } from "@/components/settings/agents-client";
import { ApiKeysClient } from "@/components/settings/api-keys-client";
import { AppearancePicker } from "@/components/settings/appearance-picker";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export default async function SettingsPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

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
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your workspace preferences.</p>
      </header>
      <Suspense fallback={null}>
        <SettingsTabs
          appearance={
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="text-sm font-medium">Theme</h2>
                <p className="text-sm text-muted-foreground">
                  Choose how Planbooq looks. System matches your device setting.
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
          agents={<AgentsClient workspaceId={membership.workspaceId} initialAgents={agents} />}
        />
      </Suspense>
    </div>
  );
}
