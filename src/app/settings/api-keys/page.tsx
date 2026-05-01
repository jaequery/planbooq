import { redirect } from "next/navigation";

export default function ApiKeysPage(): never {
  redirect("/settings?tab=api-keys");
}
