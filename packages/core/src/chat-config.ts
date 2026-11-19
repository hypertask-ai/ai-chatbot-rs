import { Config } from "effect";

import { ConfigService } from "./config-service.js";

export class ChatConfig extends ConfigService.Service<ChatConfig>()(
  "@rat-stack/core/ChatConfig",
  {
    adminPassword: Config.String("ADMIN_PASSWORD").pipe(Config.withDefault("")),
    evalIngestSecret: Config.String("EVAL_INGEST_SECRET").pipe(
      Config.withDefault("")
    ),
  }
) {}
