import { notFound, redirect } from "next/navigation";
import { OpenRouterKeyClient } from "@/components/settings/openrouter-client";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export default async function OpenRouterSettingsPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id, role: "OWNER" },
    select: {
      workspaceId: true,
      workspace: {
        select: { name: true, openrouterKeyCiphertext: true, openrouterKeyLast4: true },
      },
    },
  });
  if (!membership) notFound();

  return (
    <OpenRouterKeyClient
      workspaceId={membership.workspaceId}
      workspaceName={membership.workspace.name}
      initialStatus={{
        configured: Boolean(membership.workspace.openrouterKeyCiphertext),
        last4: membership.workspace.openrouterKeyLast4,
      }}
    />
  );
}
