import { redirect } from "next/navigation";
import { SettingsBackButton } from "@/components/settings/settings-back-button";
import { SettingsContent } from "@/components/settings/settings-content";
import { auth } from "@/server/auth";

export default async function SettingsPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) redirect("/welcome");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <SettingsBackButton />
        <h1 className="text-lg font-semibold">Settings</h1>
      </header>
      <SettingsContent />
    </div>
  );
}
