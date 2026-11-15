import { Effect, Queue, Ref, Stream } from "effect";

import { answerOutcome, runAnswer } from "./answer-machine.js";
import {
  ANSWER_FAILURE_MESSAGE,
  HAIKU_MODEL,
  emptyUsage,
} from "./answer-model.js";
import type { AnswerModel, TokenUsage } from "./answer-model.js";
import {
  buildAnswerRequest,
  profileContextBlock,
  toAnswerUserContent,
} from "./answer-request.js";
import type { ChatTurn, VisitorProfile } from "./answer-request.js";
import { ChatAnswerCleanup } from "./chat-answer-cleanup.js";
import { ChatArticleContext } from "./chat-article-context.js";
import { ChatCitations } from "./chat-citations.js";
import { ChatClock } from "./chat-clock.js";
import { ChatConversationStore } from "./chat-conversation-store.js";
import type { ChatConversation } from "./chat-conversation-store.js";
import { ChatMessageStore } from "./chat-message-store.js";
import type {
  ChatMessage,
  ChatMessageOperations,
} from "./chat-message-store.js";
import { chatTurnOf } from "./chat-message.js";
import type { ChatMessageBody } from "./chat-message.js";
import {
  chunkEvent,
  connectedEvent,
  doneEvent,
  errorEvent,
} from "./chat-stream.js";
import type { ChatStreamEvent } from "./chat-stream.js";
import { FirstAnswerCache } from "./first-answer-cache.js";

export const RESPONSE_CACHE_TTL_SECONDS = 600;

export const HISTORY_MESSAGE_LIMIT = 20;

export const normalizeQuestion = (question: string): string =>
  question
    .toLowerCase()
    .replaceAll(/['’]/gu, "")
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .slice(0, 500);

export const responseCacheKey = (
  question: string,
  articleVersion: string,
  deployId: string
): string => `${normalizeQuestion(question)}|${articleVersion}|${deployId}`;

export const profileIsKnown = (profile: VisitorProfile | null): boolean =>
  profileContextBlock(profile) !== null;

export interface FirstAnswerEligibility {
  readonly hasImage: boolean;
  readonly historyCount: number;
  readonly page: { readonly url: string } | null;
  readonly profile: VisitorProfile | null;
  readonly question: string;
}

export const firstAnswerEligible = (input: FirstAnswerEligibility): boolean =>
  normalizeQuestion(input.question) !== "" &&
  !input.hasImage &&
  input.page === null &&
  input.historyCount === 0 &&
  !profileIsKnown(input.profile);

export type ChatAnswerRequirements =
  | AnswerModel
  | ChatAnswerCleanup
  | ChatArticleContext
  | ChatCitations
  | ChatConversationStore
  | ChatMessageStore
  | FirstAnswerCache
  | typeof ChatClock;

export interface ChatAnswerInput {
  readonly answerMessageId: string;
  readonly body: ChatMessageBody;
  readonly conversationId: string;
  readonly visitorMessageId: string;
  readonly visitorSecret?: string | undefined;
}

interface StoredAnswer {
  readonly content: string;
  readonly conversationId: string;
  readonly createdAt: number;
  readonly id: string;
  readonly model: string;
  readonly role: "bot";
  readonly usage: TokenUsage;
}

const answerProfileOf = (conversation: ChatConversation): VisitorProfile => ({
  has_hypertask_account: conversation.hasAccount,
  visitor_email: conversation.email ?? null,
  visitor_name: conversation.name ?? null,
});

const assistantTurns = (
  messages: readonly ChatMessage[],
  visitorMessageId: string
): readonly ChatTurn[] =>
  messages
    .filter((message) => message.id !== visitorMessageId)
    .slice(-HISTORY_MESSAGE_LIMIT)
    .map((message) => ({
      content: message.content,
      role: message.role === "user" ? "user" : "assistant",
    }));

const appendAnswer = (
  messages: ChatMessageOperations,
  answer: StoredAnswer
): Effect.Effect<void> =>
  messages
    .append([answer])
    .pipe(
      Effect.catchCause(() =>
        Effect.logWarning("[Chat] Failed to save assistant reply")
      )
    );

const cacheableAnswer = (
  answer: { readonly cacheable: boolean; readonly text: string },
  eligible: boolean
): boolean =>
  eligible &&
  answer.cacheable &&
  answer.text.trim() !== "" &&
  !answer.text.includes("couldn't generate") &&
  !answer.text.includes("couldn't finish");

const interruptedAnswer = (
  messages: ChatMessageOperations,
  input: ChatAnswerInput,
  shown: string,
  at: number
): Effect.Effect<void> =>
  shown === ""
    ? Effect.void
    : messages
        .append([
          {
            content: `${shown} [interrupted]`,
            conversationId: input.conversationId,
            createdAt: at,
            id: input.answerMessageId,
            model: HAIKU_MODEL,
            role: "bot",
            usage: emptyUsage(),
          },
        ])
        .pipe(
          Effect.catchCause(() =>
            Effect.logWarning("[Chat] Failed to save partial reply")
          )
        );

export const chatAnswerFrames = (input: ChatAnswerInput) =>
  Stream.callback<ChatStreamEvent, never, ChatAnswerRequirements>(
    (queue) =>
      Effect.gen(function* produceChatAnswer() {
        const { conversationId } = input;
        const turn = chatTurnOf(input.body);
        const conversations = yield* ChatConversationStore;
        const messages = yield* ChatMessageStore;
        const cache = yield* FirstAnswerCache;
        const articles = yield* ChatArticleContext;
        const cleanup = yield* ChatAnswerCleanup;
        const citations = yield* ChatCitations;
        const clock = yield* ChatClock;

        const shown = yield* Ref.make("");
        const finished = yield* Ref.make(false);

        const answer: Effect.Effect<void, never, AnswerModel> = Effect.gen(
          function* answerTurn() {
            const conversation = yield* conversations.read(conversationId);

            const history = assistantTurns(
              yield* messages.list(conversationId),
              input.visitorMessageId
            );

            const profile =
              conversation === undefined ? null : answerProfileOf(conversation);

            const question = turn?.question ?? "";
            const page = turn?.page ?? null;
            const hasImage = turn?.hasImage === true;

            const eligible = firstAnswerEligible({
              hasImage,
              historyCount: history.length,
              page,
              profile,
              question,
            });

            const cached = eligible ? yield* cache.lookup(question) : undefined;

            yield* Queue.offer(
              queue,
              connectedEvent({
                conversationId,
                messageId: input.answerMessageId,
                visitorSecret: input.visitorSecret,
              })
            );

            if (cached !== undefined) {
              const at = yield* clock.now;

              yield* Queue.offer(queue, chunkEvent(cached, conversationId));
              yield* appendAnswer(messages, {
                content: cached,
                conversationId,
                createdAt: at,
                id: input.answerMessageId,
                model: HAIKU_MODEL,
                role: "bot",
                usage: emptyUsage(),
              });

              const sources = yield* citations.sourcesFor(cached);

              yield* Queue.offer(
                queue,
                doneEvent({
                  conversationId,
                  fullContent: cached,
                  messageId: input.answerMessageId,
                  sources,
                })
              );
              yield* Ref.set(finished, true);
              yield* Queue.end(queue);

              return;
            }

            const articleContext = yield* articles.forQuestion(question);

            const request = buildAnswerRequest({
              articleContext,
              history,
              page,
              profile,
              userContent: toAnswerUserContent(
                question,
                hasImage ? turn?.imageUrl : undefined
              ),
            });

            const outcome = yield* runAnswer({
              onText: (text) =>
                Ref.update(shown, (held) => held + text).pipe(
                  Effect.andThen(
                    Queue.offer(queue, chunkEvent(text, conversationId))
                  ),
                  Effect.asVoid
                ),
              request,
            });

            const at = yield* clock.now;

            if (answerOutcome.$is("Answered")(outcome)) {
              const cleaned = yield* cleanup.clean({
                conversationId,
                text: outcome.text,
              });

              yield* appendAnswer(messages, {
                content: cleaned,
                conversationId,
                createdAt: at,
                id: input.answerMessageId,
                model: HAIKU_MODEL,
                role: "bot",
                usage: outcome.usage,
              });

              if (
                cacheableAnswer(
                  { cacheable: outcome.cacheable, text: cleaned },
                  eligible
                )
              ) {
                yield* cache
                  .save(question, cleaned)
                  .pipe(
                    Effect.catchCause(() =>
                      Effect.logWarning("[Chat] response cache write failed")
                    )
                  );
              }

              const sources = yield* citations.sourcesFor(cleaned);

              yield* Queue.offer(
                queue,
                doneEvent({
                  conversationId,
                  fullContent: cleaned,
                  messageId: input.answerMessageId,
                  sources,
                })
              );
            } else {
              const partialText = yield* Ref.get(shown);
              const partial = partialText !== "";

              if (partial) {
                yield* appendAnswer(messages, {
                  content: `${partialText} [interrupted]`,
                  conversationId,
                  createdAt: at,
                  id: input.answerMessageId,
                  model: HAIKU_MODEL,
                  role: "bot",
                  usage: outcome.usage,
                });
              }

              yield* Queue.offer(
                queue,
                errorEvent({
                  conversationId,
                  error: outcome.text,
                  partial,
                })
              );
            }

            yield* Ref.set(finished, true);
            yield* Queue.end(queue);
          }
        );

        const guarded = answer.pipe(
          Effect.catchCause(() =>
            Effect.gen(function* sendFailureFrame() {
              const at = yield* clock.now;
              const partialText = yield* Ref.get(shown);

              if (partialText !== "") {
                yield* appendAnswer(messages, {
                  content: `${partialText} [interrupted]`,
                  conversationId,
                  createdAt: at,
                  id: input.answerMessageId,
                  model: HAIKU_MODEL,
                  role: "bot",
                  usage: emptyUsage(),
                });
              }

              yield* Queue.offer(
                queue,
                errorEvent({
                  conversationId,
                  error: ANSWER_FAILURE_MESSAGE,
                  partial: partialText !== "",
                })
              );
              yield* Ref.set(finished, true);
              yield* Queue.end(queue);
            })
          )
        );

        yield* guarded.pipe(
          Effect.onInterrupt(() =>
            Effect.gen(function* saveInterruptedAnswer() {
              if (yield* Ref.get(finished)) {
                return;
              }

              const at = yield* clock.now;
              const partialText = yield* Ref.get(shown);

              yield* interruptedAnswer(messages, input, partialText, at);
            })
          )
        );
      }),
    { bufferSize: 0 }
  );
