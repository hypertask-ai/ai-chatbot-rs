import { implement } from "@rat-stack/capability/implement";
import { Clock, Effect, Schema } from "effect";
import * as SecureRandom from "effect/crypto/SecureRandom";

import {
  conversationNotFoundFailure,
  handoffEmailInvalidFailure,
  handoffEmailTooSoonFailure,
  handoffEmailUnauthorizedFailure,
  handoffProfileIncompleteFailure,
  leaveHandoffEmailContract,
  requestHandoffContract,
} from "./chat-contracts.js";
import type { HandoffAnswer, HandoffEmailAnswer } from "./chat-contracts.js";
import {
  ChatConversationStore,
  conversationStateOf,
} from "./chat-conversation-store.js";
import { ChatMessageStore } from "./chat-message-store.js";
import type { ChatMessage } from "./chat-message-store.js";
import {
  ChatVisitorAuth,
  VISITOR_SECRET_MAX_LENGTH,
  hashVisitorSecret,
  readBearerToken,
} from "./chat-visitor-auth.js";
import {
  ConversationEmailSchema,
  HANDOFF_REPEAT_WINDOW_SECONDS,
  conversationStep,
  stepConversation,
} from "./conversation-machine.js";
import { CustomerAlerts } from "./customer-alerts.js";
import { HandoffEmail } from "./handoff-email.js";
import type { HandoffEmailMessage } from "./handoff-email.js";

export const HANDOFF_REPLY =
  "I'll connect you with a human. They'll respond as soon as possible.";

export const HANDOFF_EMAIL_USER_MESSAGE = "Talk to a person";

export const HANDOFF_EMAIL_REPLY =
  "Sure. A person from our team replies by email within one working day. They see this chat, so you don't need to repeat yourself.";

const HANDOFF_EMAIL_FROM = "Hypertask Help <help@hypertask.ai>";

const HANDOFF_EMAIL_TO = "help@hypertask.ai";

export interface ChatHandoffEmailRequest {
  readonly conversationId: string;
  readonly email: string;
  readonly transcript: readonly ChatMessage[];
}

export const chatHandoffEmailFor = (
  request: ChatHandoffEmailRequest
): HandoffEmailMessage => {
  const firstQuestion =
    request.transcript
      .find((message) => message.role === "user")
      ?.content.slice(0, 60)
      .replaceAll(/[\r\n]+/gu, " ") ?? "";

  return {
    conversationId: request.conversationId,
    from: HANDOFF_EMAIL_FROM,
    replyTo: request.email,
    subject:
      firstQuestion === ""
        ? `Help chat: ${request.email}`
        : `Help chat: ${request.email} - ${firstQuestion}`,
    text: `Visitor email: ${request.email}\nConversation id: ${request.conversationId}\nhttps://help.hypertask.ai/admin#conv=${encodeURIComponent(request.conversationId)}\n\n${request.transcript.map((message) => `${message.role}: ${message.content}`).join("\n\n")}`,
    to: HANDOFF_EMAIL_TO,
  };
};

export const requestHandoff = implement(requestHandoffContract, (input) =>
  Effect.gen(function* requestHandoffEffect() {
    const conversations = yield* ChatConversationStore;
    const messages = yield* ChatMessageStore;
    const alerts = yield* CustomerAlerts;
    const crypto = yield* SecureRandom.SecureRandom;
    const { conversationId } = input;

    if (conversationId === undefined || conversationId === "") {
      return yield* Effect.fail(conversationNotFoundFailure);
    }

    const conversation = yield* conversations.read(conversationId);

    if (conversation === undefined) {
      return yield* Effect.fail(conversationNotFoundFailure);
    }

    const at = Math.floor((yield* Clock.currentTimeMillis) / 1000);

    const stepped = stepConversation(conversationStateOf(conversation), {
      at,
      type: "VISITOR_REQUESTS_PERSON",
    });

    if (conversationStep.$is("Refused")(stepped)) {
      return yield* Effect.fail(
        handoffProfileIncompleteFailure(stepped.refusal.missing ?? [])
      );
    }

    yield* conversations.setHandoffRequested({
      at: stepped.state.updatedAt,
      id: conversationId,
    });

    const messageId = yield* crypto.uuidV4();

    yield* messages.append([
      {
        content: HANDOFF_REPLY,
        conversationId,
        createdAt: stepped.state.updatedAt,
        id: messageId,
        role: "bot",
      },
    ]);

    yield* alerts.handoffRequested({
      conversationId,
      isEval: conversation.isEval,
      visitorEmail: conversation.email ?? null,
      visitorName: conversation.name ?? null,
    });

    const answer: HandoffAnswer = { status: "handoff_requested" };

    return answer;
  })
);

export const leaveHandoffEmail = implement(leaveHandoffEmailContract, (input) =>
  Effect.gen(function* leaveHandoffEmailEffect() {
    const conversations = yield* ChatConversationStore;
    const messages = yield* ChatMessageStore;
    const alerts = yield* CustomerAlerts;
    const teamEmail = yield* HandoffEmail;
    const auth = yield* ChatVisitorAuth;
    const crypto = yield* SecureRandom.SecureRandom;
    const { conversationId } = input;
    const normalizedEmail = (input.email ?? "").trim().toLowerCase();

    if (
      conversationId === undefined ||
      conversationId === "" ||
      !Schema.is(ConversationEmailSchema)(normalizedEmail)
    ) {
      return yield* Effect.fail(handoffEmailInvalidFailure);
    }

    const token = readBearerToken(auth.authorization);

    if (token === undefined || token.length > VISITOR_SECRET_MAX_LENGTH) {
      return yield* Effect.fail(handoffEmailUnauthorizedFailure);
    }

    const secretHash = yield* hashVisitorSecret(token);

    const conversation = yield* conversations.readAsVisitor({
      id: conversationId,
      secretHash,
    });

    if (conversation === undefined) {
      return yield* Effect.fail(conversationNotFoundFailure);
    }

    const at = Math.floor((yield* Clock.currentTimeMillis) / 1000);

    const stepped = stepConversation(conversationStateOf(conversation), {
      at,
      email: normalizedEmail,
      type: "VISITOR_LEAVES_EMAIL",
    });

    if (conversationStep.$is("Refused")(stepped)) {
      return yield* Effect.fail(handoffEmailTooSoonFailure);
    }

    const written = yield* conversations.requestHandoffEmail({
      at: stepped.state.updatedAt,
      email: normalizedEmail,
      id: conversationId,
      repeatWindowSeconds: HANDOFF_REPEAT_WINDOW_SECONDS,
      secretHash,
    });

    if (written === "not_found") {
      return yield* Effect.fail(conversationNotFoundFailure);
    }

    if (written === "too_soon") {
      return yield* Effect.fail(handoffEmailTooSoonFailure);
    }

    const userMessageId = yield* crypto.uuidV4();
    const botMessageId = yield* crypto.uuidV4();

    yield* messages.append([
      {
        content: HANDOFF_EMAIL_USER_MESSAGE,
        conversationId,
        createdAt: stepped.state.updatedAt,
        id: userMessageId,
        role: "user",
      },
      {
        content: HANDOFF_EMAIL_REPLY,
        conversationId,
        createdAt: stepped.state.updatedAt,
        id: botMessageId,
        role: "bot",
      },
    ]);

    yield* alerts.handoffRequested({
      conversationId,
      isEval: conversation.isEval,
      visitorEmail: normalizedEmail,
      visitorName: conversation.name ?? null,
    });

    const transcript = yield* messages.list(conversationId);

    const emailed = conversation.isEval
      ? false
      : yield* teamEmail.deliver(
          chatHandoffEmailFor({
            conversationId,
            email: normalizedEmail,
            transcript,
          })
        );

    const answer: HandoffEmailAnswer = {
      emailed,
      status: "handoff_requested",
    };

    return answer;
  })
);
