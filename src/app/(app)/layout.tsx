import { notFound, redirect } from "next/navigation";
import { AgentSessionGlobalListener } from "@/components/agent-session-global-listener";
import { AgentSessionManagerMount } from "@/components/agent-session-manager-mount";
import { SettingsContent } from "@/components/settings/settings-content";
import { Sidebar } from "@/components/sidebar/sidebar";
import { SidebarProvider } from "@/components/sidebar/sidebar-state";
import { SidebarToggle } from "@/components/sidebar/sidebar-toggle";
import { UserMenu } from "@/components/user-menu";
import { extractShortcuts, extractSidebarSectionState } from "@/lib/shortcuts/defaults";
import { ShortcutsProvider } from "@/lib/shortcuts/provider";
import type { ProjectSummary } from "@/lib/types";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/welcome");
  }

  const [membership, currentUser] = await Promise.all([
    prisma.member.findFirst({
      where: { userId: session.user.id },
      select: { workspaceId: true, workspace: { select: { name: true } } },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferences: true },
    }),
  ]);
  if (!membership) notFound();
  const shortcuts = extractShortcuts(currentUser?.preferences);
  const sectionState = extractSidebarSectionState(currentUser?.preferences);

  const [projectRows, statusRows] = await Promise.all([
    prisma.project.findMany({
      where: { workspaceId: membership.workspaceId },
      orderBy: { position: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        color: true,
        description: true,
        localPath: true,
      },
    }),
    prisma.status.findMany({
      where: {
        workspaceId: membership.workspaceId,
        key: { in: ["review", "building", "blocked"] },
      },
      select: { id: true, key: true },
    }),
  ]);

  const trackedStatusIds = statusRows.map((s) => s.id);
  const ticketCounts = trackedStatusIds.length
    ? await prisma.ticket.groupBy({
        by: ["projectId", "statusId"],
        where: {
          workspaceId: membership.workspaceId,
          statusId: { in: trackedStatusIds },
          archivedAt: null,
        },
        _count: { _all: true },
      })
    : [];
  const statusKeyById = new Map(statusRows.map((s) => [s.id, s.key]));
  const allProjects: ProjectSummary[] = projectRows.map((p) => {
    let reviewCount = 0;
    let buildingCount = 0;
    let blockedCount = 0;
    for (const c of ticketCounts) {
      if (c.projectId !== p.id) continue;
      const key = statusKeyById.get(c.statusId);
      if (key === "review") reviewCount = c._count._all;
      else if (key === "building") buildingCount = c._count._all;
      else if (key === "blocked") blockedCount = c._count._all;
    }
    return { ...p, reviewCount, buildingCount, blockedCount };
  });

  return (
    <SidebarProvider>
      <ShortcutsProvider shortcuts={shortcuts}>
        <div className="flex h-screen min-h-0 bg-background">
          <AgentSessionManagerMount />
          <AgentSessionGlobalListener workspaceId={membership.workspaceId} />
          <Sidebar
            projects={allProjects}
            workspaceId={membership.workspaceId}
            sectionState={sectionState}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-2 pr-4">
              <div className="flex items-center gap-1.5 text-[13px]">
                <SidebarToggle />
                <span className="ml-1 text-muted-foreground/60">{membership.workspace.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <UserMenu
                  email={session.user.email}
                  name={session.user.name}
                  image={session.user.image}
                  settingsContent={<SettingsContent />}
                />
              </div>
            </header>
            <div className="min-h-0 flex-1">{children}</div>
          </div>
        </div>
      </ShortcutsProvider>
    </SidebarProvider>
  );
}
