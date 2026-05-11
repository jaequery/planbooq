"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export function SettingsBackButton(): React.ReactElement {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push("/welcome");
      }}
      className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back
    </button>
  );
}
