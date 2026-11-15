import { Effect } from "effect";

import {
  chatReadForbiddenFailure,
  chatReadUnauthorizedFailure,
} from "./chat-contracts.js";
import type { ChatConversationOperations } from "./chat-conversation-store.js";
import {
  VISITOR_SECRET_MAX_LENGTH,
  hashVisitorSecret,
  readBearerToken,
} from "./chat-visitor-auth.js";

export type ChatReadRefusal =
  | typeof chatReadForbiddenFailure
  | typeof chatReadUnauthorizedFailure;

export type ChatReadCredential =
  | { readonly refusal: ChatReadRefusal; readonly type: "refused" }
  | { readonly type: "admin" }
  | { readonly secret: string; readonly type: "visitor" };

export const chatReadCredentialOf = (input: {
  readonly adminPassword: string;
  readonly authorization: string | undefined;
}): ChatReadCredential => {
  const { adminPassword, authorization } = input;

  if (adminPassword !== "" && authorization === `Bearer ${adminPassword}`) {
    return { type: "admin" };
  }

  const secret = readBearerToken(authorization);

  if (secret === undefined) {
    return { refusal: chatReadUnauthorizedFailure, type: "refused" };
  }

  return secret.length > VISITOR_SECRET_MAX_LENGTH
    ? { refusal: chatReadForbiddenFailure, type: "refused" }
    : { secret, type: "visitor" };
};

const chatReadGrantBrand: unique symbol = Symbol("ChatReadGrant");

export interface ConversationReadGrant {
  readonly [chatReadGrantBrand]: true;
  readonly conversationId: string;
  readonly visitorSecretHash: string | undefined;
}

export interface VisitorReadGrant {
  readonly [chatReadGrantBrand]: true;
  readonly visitorId: string;
  readonly visitorSecretHash: string | undefined;
}

interface ChatReadRequestBase {
  readonly adminPassword: string;
  readonly authorization: string | undefined;
  readonly conversations: ChatConversationOperations;
}

export interface ChatHistoryReadRequest extends ChatReadRequestBase {
  readonly conversationId: string;
}

export interface ChatSessionsReadRequest extends ChatReadRequestBase {
  readonly visitorId: string;
}

const grantOf = (
  request: ChatHistoryReadRequest | ChatSessionsReadRequest,
  visitorSecretHash?: string
): ConversationReadGrant | VisitorReadGrant =>
  "conversationId" in request
    ? {
        [chatReadGrantBrand]: true,
        conversationId: request.conversationId,
        visitorSecretHash,
      }
    : {
        [chatReadGrantBrand]: true,
        visitorId: request.visitorId,
        visitorSecretHash,
      };

const ownsReadTarget = (
  request: ChatHistoryReadRequest | ChatSessionsReadRequest,
  secretHash: string
): Effect.Effect<boolean> =>
  ("conversationId" in request
    ? request.conversations
        .readAsVisitor({ id: request.conversationId, secretHash })
        .pipe(Effect.map((conversation) => conversation !== undefined))
    : request.conversations.visitorOwnsSecret({
        secretHash,
        visitorId: request.visitorId,
      })
  ).pipe(Effect.catchCause(() => Effect.succeed(false)));

export function chatReadGrant(
  request: ChatHistoryReadRequest
): Effect.Effect<ConversationReadGrant, ChatReadRefusal>;
export function chatReadGrant(
  request: ChatSessionsReadRequest
): Effect.Effect<VisitorReadGrant, ChatReadRefusal>;
export function chatReadGrant(
  request: ChatHistoryReadRequest | ChatSessionsReadRequest
): Effect.Effect<ConversationReadGrant | VisitorReadGrant, ChatReadRefusal> {
  return Effect.gen(function* grantChatRead() {
    const credential = chatReadCredentialOf(request);

    if (credential.type === "refused") {
      return yield* Effect.fail(credential.refusal);
    }

    if (credential.type === "admin") {
      return grantOf(request);
    }

    const secretHash = yield* hashVisitorSecret(credential.secret);

    const owned = yield* ownsReadTarget(request, secretHash);

    return owned
      ? grantOf(request, secretHash)
      : yield* Effect.fail(chatReadForbiddenFailure);
  });
}
