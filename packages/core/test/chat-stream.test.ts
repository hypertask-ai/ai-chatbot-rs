// @effect-diagnostics nodeBuiltinImport:off -- This test compares the encoded frames with the record taken from the old route.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ANSWER_FAILURE_MESSAGE,
  CHAT_STREAM_HEADERS,
  HAIKU_BUSY_MESSAGE,
  chunkEvent,
  connectedEvent,
  doneEvent,
  encodeChatStream,
  encodeChatStreamBytes,
  encodeChatStreamEvent,
  errorEvent,
} from "../src/index.js";
import type { ChatStreamEvent } from "../src/index.js";

const recorded = (name: string): string =>
  readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf-8");

const decodeAll = (bytes: Uint8Array): string => {
  const decoder = new TextDecoder("utf-8");

  return decoder.decode(bytes);
};

const decodeInPieces = (bytes: Uint8Array): string => {
  const decoder = new TextDecoder("utf-8");
  let text = "";

  for (const byte of bytes) {
    text += decoder.decode(new Uint8Array([byte]), { stream: true });
  }

  return text + decoder.decode();
};

const pricingSource = {
  slug: "pricing-plans",
  title: "Pricing plans",
  url: "https://help.hypertask.ai/help/pricing-plans",
};

const answerFrames = (): readonly ChatStreamEvent[] => [
  connectedEvent({ conversationId: "conv-1", messageId: "msg-1" }),
  chunkEvent("Pro is ", "conv-1"),
  chunkEvent("$16 per ", "conv-1"),
  chunkEvent("user.", "conv-1"),
  doneEvent({
    conversationId: "conv-1",
    fullContent: "Pro is $16 per user.",
    messageId: "msg-1",
    sources: [pricingSource],
  }),
];

const multibyteFrames = (): readonly ChatStreamEvent[] => [
  connectedEvent({
    conversationId: "conv-2",
    messageId: "msg-2",
    visitorSecret: "secret-2",
  }),
  chunkEvent("Prix : 16 € ", "conv-2"),
  chunkEvent("café ", "conv-2"),
  chunkEvent("— fin, naïve.", "conv-2"),
  doneEvent({
    conversationId: "conv-2",
    fullContent: "Prix : 16 € café — fin, naïve.",
    messageId: "msg-2",
    sources: [],
  }),
];

const busyFrames = (): readonly ChatStreamEvent[] => [
  connectedEvent({ conversationId: "conv-3", messageId: "msg-3" }),
  errorEvent({
    conversationId: "conv-3",
    error: HAIKU_BUSY_MESSAGE,
    partial: false,
  }),
];

const errorFrames = (): readonly ChatStreamEvent[] => [
  connectedEvent({ conversationId: "conv-4", messageId: "msg-4" }),
  chunkEvent("Partial ", "conv-4"),
  errorEvent({
    conversationId: "conv-4",
    error: HAIKU_BUSY_MESSAGE,
    partial: true,
  }),
];

const failureFrames = (): readonly ChatStreamEvent[] => [
  connectedEvent({ conversationId: "conv-5", messageId: "msg-5" }),
  chunkEvent("Half an ", "conv-5"),
  errorEvent({
    conversationId: "conv-5",
    error: ANSWER_FAILURE_MESSAGE,
    partial: true,
  }),
];

describe("the chat stream encoder", () => {
  it("writes the frames recorded from a streamed answer", () => {
    expect(encodeChatStream(answerFrames())).toBe(
      recorded("chat-stream-answer.txt")
    );
  });

  it("keeps a multi-byte answer whole when the bytes arrive one at a time", () => {
    const bytes = encodeChatStreamBytes(multibyteFrames());
    const expected = recorded("chat-stream-multibyte.txt");

    expect(decodeAll(bytes)).toBe(expected);
    expect(decodeInPieces(bytes)).toBe(expected);
  });

  it("writes the busy frame when the model never answers", () => {
    expect(encodeChatStream(busyFrames())).toBe(
      recorded("chat-stream-busy.txt")
    );
  });

  it("writes the busy frame after the text already shown", () => {
    expect(encodeChatStream(errorFrames())).toBe(
      recorded("chat-stream-error.txt")
    );
  });

  it("writes the failure frame when the answer breaks", () => {
    expect(encodeChatStream(failureFrames())).toBe(
      recorded("chat-stream-failure.txt")
    );
  });

  it("separates every frame with one blank line and one data line", () => {
    const encoded = encodeChatStream(answerFrames());
    const frames = encoded.split("\n\n").filter((frame) => frame !== "");

    expect(frames).toHaveLength(5);

    for (const frame of frames) {
      expect(frame.startsWith("data: ")).toBe(true);
      expect(frame).not.toContain("\n");
    }
  });

  it("leaves the visitor secret out until one is issued", () => {
    const encoded = encodeChatStreamEvent(
      connectedEvent({ conversationId: "conv-1", messageId: "msg-1" })
    );

    expect(encoded).toBe(
      'data: {"type":"connected","conversationId":"conv-1","messageId":"msg-1"}\n\n'
    );
  });

  it("sends the four headers the old route sets", () => {
    expect(CHAT_STREAM_HEADERS).toEqual({
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "Transfer-Encoding": "chunked",
    });
  });
});
