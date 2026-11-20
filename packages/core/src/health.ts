import { implement } from "@rat-stack/capability/implement";
import { Effect } from "effect";

import { healthContract } from "./contracts.js";

export const health = implement(healthContract, () =>
  Effect.succeed({ service: "ai-chatbot" as const, status: "ok" as const })
);
