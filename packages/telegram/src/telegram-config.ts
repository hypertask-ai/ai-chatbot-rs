import { ConfigService } from "@rat-stack/core";
import { Config } from "effect";

export class TelegramConfig extends ConfigService.Service<TelegramConfig>()(
  "@rat-stack/telegram/TelegramConfig",
  {
    botToken: Config.Redacted("TELEGRAM_BOT_TOKEN").pipe(Config.option),
    chatId: Config.String("TELEGRAM_CHAT_ID").pipe(Config.option),
  }
) {}
