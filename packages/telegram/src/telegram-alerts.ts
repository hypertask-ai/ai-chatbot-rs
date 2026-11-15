import { CustomerAlerts, customerAlertText } from "@rat-stack/core";
import type { CustomerAlert, CustomerAlertOperations } from "@rat-stack/core";
import { Effect, Layer, Option, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";

import { TelegramConfig } from "./telegram-config.js";

export const TELEGRAM_API_ORIGIN = "https://api.telegram.org";

export const telegramSendMessageUrl = (botToken: string): string =>
  `${TELEGRAM_API_ORIGIN}/bot${botToken}/sendMessage`;

const filledToken = (token: Redacted.Redacted): boolean =>
  Redacted.value(token) !== "";

export const telegramAlertsLayer = Layer.effect(
  CustomerAlerts,
  Effect.gen(function* buildTelegramAlerts() {
    const config = yield* TelegramConfig;
    const client = yield* HttpClient.HttpClient;
    const botToken = config.botToken.pipe(Option.filter(filledToken));
    const chatId = config.chatId.pipe(Option.filter((value) => value !== ""));

    const sendCustomerAlert = (alert: CustomerAlert): Effect.Effect<boolean> =>
      Effect.gen(function* sendTelegramMessage() {
        const { conversationId, isEval } = alert.alert;

        if (isEval) {
          yield* Effect.logInfo("[Telegram] skipped eval alert", {
            conversationId,
            type: alert.type,
          });

          return false;
        }

        if (Option.isNone(botToken) || Option.isNone(chatId)) {
          return false;
        }

        const request = HttpClientRequest.post(
          telegramSendMessageUrl(Redacted.value(botToken.value))
        ).pipe(
          HttpClientRequest.setHeaders({ "content-type": "application/json" }),
          HttpClientRequest.bodyText(
            JSON.stringify({
              chat_id: chatId.value,
              disable_web_page_preview: true,
              parse_mode: "HTML",
              text: customerAlertText(alert),
            }),
            "application/json"
          )
        );

        const sent = yield* client.execute(request).pipe(
          Effect.as(true),
          Effect.catchCause(() => Effect.succeed(false))
        );

        yield* sent
          ? Effect.logInfo("[Telegram] sent alert", {
              conversationId,
              type: alert.type,
            })
          : Effect.logError("[Telegram] failed to send alert", {
              conversationId,
              type: alert.type,
            });

        return sent;
      });

    return {
      handoffRequested: (alert) =>
        sendCustomerAlert({ alert, type: "handoff_requested" }),
      newConversation: (alert) =>
        sendCustomerAlert({ alert, type: "new_conversation" }),
      newMessage: (alert) => sendCustomerAlert({ alert, type: "new_message" }),
    } satisfies CustomerAlertOperations;
  })
);
