import { ConfigService } from "@rat-stack/core";
import { Config } from "effect";

export class AnthropicConfig extends ConfigService.Service<AnthropicConfig>()(
  "@rat-stack/haiku/AnthropicConfig",
  {
    accountId: Config.Redacted("CLOUDFLARE_ACCOUNT_ID"),
    apiKey: Config.Redacted("ANTHROPIC_API_KEY"),
  }
) {}
