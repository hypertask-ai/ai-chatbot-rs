import { toHttpApi } from "@rat-stack/capability/http-api";
import { ChatConfig } from "@rat-stack/core/chat-config";
import {
  ChatConversationStore,
  memoryChatConversations,
} from "@rat-stack/core/chat-conversation-store";
import { readChatHistory } from "@rat-stack/core/chat-history";
import {
  ChatMessageStore,
  memoryChatMessages,
} from "@rat-stack/core/chat-message-store";
import { ChatVisitorAuth } from "@rat-stack/core/chat-visitor-auth";
import type { ChatVisitorAuthValue } from "@rat-stack/core/chat-visitor-auth";
import { health } from "@rat-stack/core/health";
import {
  listHelpArticles,
  readHelpArticle,
  searchHelpArticles,
} from "@rat-stack/core/help-articles";
import {
  HelpArticleCorpus,
  debugHelpRetrieval,
} from "@rat-stack/core/help-retrieval";
import * as AlchemyHttp from "alchemy/Http";
import { Effect, Layer, Schema } from "effect";
import { HttpRouter } from "effect/http";
import type { HttpServerRequest } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";

import { withCors } from "./embed-cors.js";
import { recordedHelpArticles } from "./recorded-help-articles.js";

const healthPath = "/health";

const articleListPath = "/api/articles";

const articlePrefix = `${articleListPath}/`;

const articleSearchPrefix = `${articlePrefix}search/`;

const debugRetrievalPath = "/api/chat/debug-rag";

const chatHistoryPrefix = "/api/chat/history/";

const isOneSegment = (value: string): boolean =>
  value !== "" && !value.includes("/");

const isArticleSearch = (route: string): boolean =>
  route.startsWith(articleSearchPrefix) &&
  isOneSegment(route.slice(articleSearchPrefix.length));

const isArticleRow = (route: string): boolean =>
  route.startsWith(articlePrefix) &&
  isOneSegment(route.slice(articlePrefix.length));

const isChatHistory = (route: string): boolean =>
  route.startsWith(chatHistoryPrefix) &&
  isOneSegment(route.slice(chatHistoryPrefix.length));

export const isHelpApiRoute = (route: string): boolean =>
  route === healthPath ||
  route === articleListPath ||
  route === debugRetrievalPath ||
  isArticleSearch(route) ||
  isArticleRow(route) ||
  isChatHistory(route);

const visitorAuthFromRequest = {
  failure: Schema.Never,
  from: (request: HttpServerRequest.HttpServerRequest) =>
    Effect.succeed<ChatVisitorAuthValue>({
      authorization: request.headers.authorization,
    }),
  tag: ChatVisitorAuth,
};

const helpApi = toHttpApi(
  "help.hypertask.ai",
  [
    health,
    listHelpArticles,
    readHelpArticle,
    searchHelpArticles,
    debugHelpRetrieval,
    readChatHistory,
  ],
  { provide: [visitorAuthFromRequest] }
);

const chatStores = Layer.mergeAll(
  Layer.effect(
    ChatConversationStore,
    memoryChatConversations([]).pipe(Effect.map((held) => held.operations))
  ),
  Layer.effect(
    ChatMessageStore,
    memoryChatMessages().pipe(Effect.map((held) => held.operations))
  ),
  ChatConfig.configLayer({ adminPassword: "", evalIngestSecret: "" })
);

const siteServices = Layer.mergeAll(
  recordedHelpArticles,
  HelpArticleCorpus.layerFromStore,
  chatStores
);

const helpApiRoutes = HttpApiBuilder.layer(helpApi.api).pipe(
  Layer.provide(helpApi.layer),
  Layer.provide(siteServices),
  Layer.provide(AlchemyHttp.Platform)
);

const helpApiAnswers = HttpRouter.toWebHandler(helpApiRoutes, {
  disableLogger: true,
});

const credentialHeaders = (request: Request): Headers => {
  const headers = new Headers();
  const authorization = request.headers.get("authorization");

  if (authorization !== null) {
    headers.set("authorization", authorization);
  }

  return headers;
};

export const answerHelpApi = Effect.fn("helpApi.answer")(
  function* answerHelpApi(request: Request, route: string) {
    const routed = new URL(request.url);
    routed.pathname = route;

    const answered = yield* Effect.promise(() =>
      helpApiAnswers.handler(
        new Request(routed, {
          headers: credentialHeaders(request),
          method: "GET",
        })
      )
    );

    return withCors(request, answered);
  }
);
