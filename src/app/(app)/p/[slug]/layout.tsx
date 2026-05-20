import { notFound, redirect } from "next/navigation";
import { ProjectHeaderMenu } from "@/components/board/project-header-menu";
import { PillarNav } from "@/components/pillars/pillar-nav";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export default async function ProjectLayout({
  children,
  params,
}: Props): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");

  const { slug } = await params;

  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id },
    select: { workspaceId: true },
  });
  if (!membership) notFound();

  const project = await prisma.project.findUnique({
    where: { workspaceId_slug: { workspaceId: membership.workspaceId, slug } },
    select: {
      id: true,
      name: true,
      color: true,
      description: true,
      localPath: true,
    },
  });
  if (!project) notFound();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/60 px-3 text-[13px]">
        <ProjectHeaderMenu
          workspaceId={membership.workspaceId}
          projectId={project.id}
          projectName={project.name}
          projectColor={project.color}
          projectDescription={project.description}
          projectLocalPath={project.localPath}
        />
        <span className="mx-1 h-4 w-px bg-border/60" aria-hidden="true" />
        <PillarNav slug={slug} />
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
