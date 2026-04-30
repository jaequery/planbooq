import { notFound, redirect } from "next/navigation";
import { ApiKeysClient } from "@/components/settings/api-keys-client";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export default async function ApiKeysPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id },
    select: { workspaceId: true, workspace: { select: { name: true, slug: true } } },
  });
  if (!membership) notFound();

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
    <ApiKeysClient
      workspaceId={membership.workspaceId}
      workspaceName={membership.workspace.name}
      initialKeys={keys}
    />
  );
}
