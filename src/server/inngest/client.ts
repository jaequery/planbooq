import { Inngest } from "inngest";

import { env } from "@/env";

export const inngest = new Inngest({
  id: "planbooq",
  ...(env.INNGEST_EVENT_KEY ? { eventKey: env.INNGEST_EVENT_KEY } : {}),
});
