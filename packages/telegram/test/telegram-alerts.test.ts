import { describe, expect, it } from "@effect/vitest";
import { CustomerAlerts, isVerifiedEvalRequest } from "@rat-stack/core";
import type {
  CustomerAlertOperations,
  HandoffAlert,
  NewConversationAlert,
  NewMessageAlert,
} from "@rat-stack/core";
import { Effect, Layer, Option, Predicate, Redacted, Ref } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";

import { TelegramConfig, telegramAlertsLayer } from "../src/index.js";

interface Captured {
  readonly body: string;
  readonly header: Record<string, string>;
  readonly method: string;
  readonly url: string;
}

interface Settings {
  readonly botToken: Option.Option<Redacted.Redacted>;
  readonly chatId: Option.Option<string>;
}

const BOT_TOKEN = "test-bot";

const CHAT_ID = "test-chat";

const CHAT_URL = "https://help.hypertask.ai/admin#conv=conv-1";

const configured = (): Settings => ({
  botToken: Option.some(Redacted.make(BOT_TOKEN)),
  chatId: Option.some(CHAT_ID),
});

const capture = (captured: Ref.Ref<readonly Captured[]>) =>
  HttpClient.make((request) =>
    Effect.gen(function* captureTelegramRequest() {
      const { body } = request;
      const bytes = Predicate.isTagged(body, "Uint8Array")
        ? body.body
        : new Uint8Array();

      yield* Ref.update(captured, (all) => [
        ...all,
        {
          body: new TextDecoder().decode(bytes),
          header: request.headers,
          method: request.method,
          url: request.url,
        },
      ]);

      return HttpClientResponse.fromWeb(
        request,
        new Response("{}", { status: 200 })
      );
    })
  );

const answering = (status: number) =>
  HttpClient.make((request) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(request, new Response("{}", { status }))
    )
  );

const unreachable = HttpClient.make(() =>
  Effect.die("Telegram is unreachable")
);

const telegramAlerts = (
  settings: Settings,
  captured: Ref.Ref<readonly Captured[]>,
  client?: HttpClient.HttpClient
) =>
  telegramAlertsLayer.pipe(
    Layer.provide(
      Layer.merge(
        TelegramConfig.configLayer(settings),
        Layer.succeed(HttpClient.HttpClient, client ?? capture(captured))
      )
    )
  );

interface AlertRun {
  readonly captured: readonly Captured[];
  readonly outcome: boolean;
}

const runAlert = (
  settings: Settings,
  operation: (alerts: CustomerAlertOperations) => Effect.Effect<boolean>,
  client?: HttpClient.HttpClient
): Effect.Effect<AlertRun> =>
  Effect.gen(function* runOneAlert() {
    const captured = yield* Ref.make<readonly Captured[]>([]);

    const outcome = yield* CustomerAlerts.use(operation).pipe(
      Effect.provide(telegramAlerts(settings, captured, client))
    );

    return { captured: yield* Ref.get(captured), outcome };
  });

const newConversation: NewConversationAlert = {
  conversationId: "conv-1",
  isEval: false,
  message: "Hello, I need help with billing",
};

const handoff: HandoffAlert = {
  conversationId: "conv-1",
  isEval: false,
  visitorEmail: "ada@example.com",
  visitorName: "Ada",
};

const newMessage: NewMessageAlert = {
  conversationId: "conv-1",
  isEval: false,
  message: "Where is my invoice?",
  visitorEmail: "ada@example.com",
  visitorName: "Ada",
};

const expectedBody = (text: string, chatId = CHAT_ID): string =>
  JSON.stringify({
    chat_id: chatId,
    disable_web_page_preview: true,
    parse_mode: "HTML",
    text,
  });

const expectedUrl = (): string =>
  `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

describe("customer alerts over the Help Desk bot", () => {
  it.effect("sends a new conversation to the bot with the old text", () =>
    Effect.gen(function* sendNewConversationAlert() {
      const run = yield* runAlert(configured(), (alerts) =>
        alerts.newConversation(newConversation)
      );
      const [request] = run.captured;

      expect(run.outcome).toBe(true);
      expect(run.captured).toHaveLength(1);
      expect(request?.url).toBe(expectedUrl());
      expect(request?.method).toBe("POST");
      expect(request?.header["content-type"]).toBe("application/json");
      expect(request?.body).toBe(
        expectedBody(
          `<b>New Conversation</b>\n\nCustomer: Unknown visitor\nMessage: Hello, I need help with billing\n\n<a href="${CHAT_URL}">Open Chat</a>`
        )
      );
    })
  );

  it.effect("sends a handoff request with the customer and email", () =>
    Effect.gen(function* sendHandoffAlert() {
      const run = yield* runAlert(configured(), (alerts) =>
        alerts.handoffRequested(handoff)
      );
      const [request] = run.captured;

      expect(run.outcome).toBe(true);
      expect(request?.body).toBe(
        expectedBody(
          `<b>Handoff Requested</b>\n\nCustomer: Ada\nEmail: ada@example.com\n\n<a href="${CHAT_URL}">Accept Handoff</a>`
        )
      );
    })
  );

  it.effect("sends a new customer message with the reply link", () =>
    Effect.gen(function* sendNewMessageAlert() {
      const run = yield* runAlert(configured(), (alerts) =>
        alerts.newMessage(newMessage)
      );
      const [request] = run.captured;

      expect(run.outcome).toBe(true);
      expect(request?.body).toBe(
        expectedBody(
          `<b>New Message</b>\n\nFrom: Ada\nMessage: Where is my invoice?\n\n<a href="${CHAT_URL}">Reply</a>`
        )
      );
    })
  );

  it.effect(
    "sends nothing for a conversation the replay secret marks as eval",
    () =>
      Effect.gen(function* sendEvalAlerts() {
        const isEval = isVerifiedEvalRequest("eval-secret", "eval-secret");

        expect(isEval).toBe(true);

        const conversation: NewConversationAlert = {
          ...newConversation,
          isEval,
        };

        const message: NewMessageAlert = { ...newMessage, isEval };

        const person: HandoffAlert = { ...handoff, isEval };

        const captured = yield* Ref.make<readonly Captured[]>([]);

        const outcomes = yield* CustomerAlerts.use((alerts) =>
          Effect.all([
            alerts.newConversation(conversation),
            alerts.handoffRequested(person),
            alerts.newMessage(message),
          ])
        ).pipe(Effect.provide(telegramAlerts(configured(), captured)));

        expect(outcomes).toEqual([false, false, false]);
        expect(yield* Ref.get(captured)).toEqual([]);
      })
  );

  it.effect("sends nothing when the bot token is unset", () =>
    Effect.gen(function* sendWithoutToken() {
      const run = yield* runAlert(
        { botToken: Option.none(), chatId: Option.some(CHAT_ID) },
        (alerts) => alerts.handoffRequested(handoff)
      );

      expect(run.captured).toEqual([]);
      expect(run.outcome).toBe(false);
    })
  );

  it.effect("sends nothing when the chat id is unset", () =>
    Effect.gen(function* sendWithoutChat() {
      const run = yield* runAlert(
        {
          botToken: Option.some(Redacted.make(BOT_TOKEN)),
          chatId: Option.none(),
        },
        (alerts) => alerts.handoffRequested(handoff)
      );

      expect(run.captured).toEqual([]);
      expect(run.outcome).toBe(false);
    })
  );

  it.effect("sends nothing when the token is set to an empty value", () =>
    Effect.gen(function* sendWithEmptyToken() {
      const run = yield* runAlert(
        {
          botToken: Option.some(Redacted.make("")),
          chatId: Option.some(CHAT_ID),
        },
        (alerts) => alerts.handoffRequested(handoff)
      );

      expect(run.captured).toEqual([]);
      expect(run.outcome).toBe(false);
    })
  );

  it.effect("answers false when Telegram cannot be reached", () =>
    Effect.gen(function* sendToUnreachableBot() {
      const run = yield* runAlert(
        configured(),
        (alerts) => alerts.handoffRequested(handoff),
        unreachable
      );

      expect(run.outcome).toBe(false);
    })
  );

  it.effect("answers true when Telegram answers with an error status", () =>
    Effect.gen(function* sendToRefusingBot() {
      const run = yield* runAlert(
        configured(),
        (alerts) => alerts.handoffRequested(handoff),
        answering(500)
      );

      expect(run.outcome).toBe(true);
    })
  );
});
