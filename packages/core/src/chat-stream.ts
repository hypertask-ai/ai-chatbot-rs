export interface ChatStreamSource {
  readonly slug: string;
  readonly title: string;
  readonly url: string;
}

export interface ChatStreamConnected {
  readonly type: "connected";
  readonly conversationId: string;
  readonly messageId: string;
  readonly visitorSecret?: string;
}

export interface ChatStreamChunk {
  readonly type: "chunk";
  readonly content: string;
  readonly conversationId: string;
}

export interface ChatStreamDone {
  readonly type: "done";
  readonly conversationId: string;
  readonly messageId: string;
  readonly fullContent: string;
  readonly sources: readonly ChatStreamSource[];
}

export interface ChatStreamError {
  readonly type: "error";
  readonly error: string;
  readonly conversationId: string;
  readonly partial: boolean;
}

export type ChatStreamEvent =
  | ChatStreamChunk
  | ChatStreamConnected
  | ChatStreamDone
  | ChatStreamError;

export interface ChatStreamStart {
  readonly conversationId: string;
  readonly messageId: string;
  readonly visitorSecret?: string | undefined;
}

export interface ChatStreamFinish {
  readonly conversationId: string;
  readonly fullContent: string;
  readonly messageId: string;
  readonly sources: readonly ChatStreamSource[];
}

export interface ChatStreamFailure {
  readonly conversationId: string;
  readonly error: string;
  readonly partial: boolean;
}

export const connectedEvent = (start: ChatStreamStart): ChatStreamConnected => {
  // oxlint-disable-next-line sort-keys -- The chat widget reads these frames and the fixtures compare the encoded bytes, which keep the old key order.
  const base: ChatStreamConnected = {
    type: "connected",
    conversationId: start.conversationId,
    messageId: start.messageId,
  };

  return start.visitorSecret === undefined
    ? base
    : { ...base, visitorSecret: start.visitorSecret };
};

export const chunkEvent = (
  content: string,
  conversationId: string
): ChatStreamChunk => {
  // oxlint-disable-next-line sort-keys -- The chat widget reads these frames and the fixtures compare the encoded bytes, which keep the old key order.
  const frame: ChatStreamChunk = { type: "chunk", content, conversationId };

  return frame;
};

export const doneEvent = (finish: ChatStreamFinish): ChatStreamDone => {
  // oxlint-disable-next-line sort-keys -- The chat widget reads these frames and the fixtures compare the encoded bytes, which keep the old key order.
  const frame: ChatStreamDone = {
    type: "done",
    conversationId: finish.conversationId,
    messageId: finish.messageId,
    fullContent: finish.fullContent,
    sources: finish.sources,
  };

  return frame;
};

export const errorEvent = (failure: ChatStreamFailure): ChatStreamError => {
  // oxlint-disable-next-line sort-keys -- The chat widget reads these frames and the fixtures compare the encoded bytes, which keep the old key order.
  const frame: ChatStreamError = {
    type: "error",
    error: failure.error,
    conversationId: failure.conversationId,
    partial: failure.partial,
  };

  return frame;
};

export const CHAT_STREAM_HEADERS = {
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "Content-Type": "text/event-stream",
  "Transfer-Encoding": "chunked",
};

export const CHAT_STREAM_CONTENT_TYPE = "text/event-stream";

export const encodeChatStreamEvent = (event: ChatStreamEvent): string => {
  const lines = JSON.stringify(event)
    .split("\n")
    .map((line) => `data: ${line}`);

  return `${lines.join("\n")}\n\n`;
};

export const encodeChatStream = (events: readonly ChatStreamEvent[]): string =>
  events.map(encodeChatStreamEvent).join("");

export const encodeChatStreamBytes = (
  events: readonly ChatStreamEvent[]
): Uint8Array => new TextEncoder().encode(encodeChatStream(events));
