import { redirect } from "next/navigation";
import { AppearancePicker } from "@/components/settings/appearance-picker";
import { auth } from "@/server/auth";

export default async function AppearancePage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Appearance</h1>
        <p className="text-sm text-muted-foreground">
          Choose how Planbooq looks. System matches your device setting.
        </p>
      </header>
      <AppearancePicker />
    </div>
  );
}
