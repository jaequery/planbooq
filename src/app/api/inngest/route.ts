import { serve } from "inngest/next";

import { inngest } from "@/server/inngest/client";
import { inngestFunctions } from "@/server/inngest/functions";

// Signing key is configured on the Inngest client (see server/inngest/client.ts)
// — passed only when non-empty so the SDK fails closed in production rather than
// running with signingKey: "".
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
});
