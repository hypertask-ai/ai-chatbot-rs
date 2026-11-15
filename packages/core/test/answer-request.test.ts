// @effect-diagnostics nodeBuiltinImport:off -- This test reads the recorded prompt and stream fixtures from disk.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildAnswerRequest,
  HISTORY_TURN_LIMIT,
  MAX_OUTPUT_TOKENS,
  PERSON_FOLLOWUP,
  SYSTEM_PROMPT,
  toAnswerUserContent,
  trimConversation,
} from "../src/index.js";
import type { ChatTurn } from "../src/index.js";

const recorded = (name: string): string =>
  readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf-8");

const articleContext =
  "AVAILABLE ARTICLES (ONLY link to these - do NOT invent other URLs):\n---\nTitle: Install the CLI\nRun the installer from the command line.\n---";

const turn = (index: number): ChatTurn => ({
  content: `turn-${index}`,
  role: index % 2 === 0 ? "user" : "assistant",
});

const turns = (count: number): ChatTurn[] =>
  Array.from({ length: count }, (_unused, index) => turn(index));

const build = (overrides: {
  readonly history?: readonly ChatTurn[];
  readonly userContent?: string;
}) =>
  buildAnswerRequest({
    articleContext,
    history: overrides.history ?? [],
    userContent: overrides.userContent ?? "current question",
  });

describe("help answer prompt", () => {
  it("keeps the recorded system prompt from the old help site byte for byte", () => {
    expect(SYSTEM_PROMPT).toBe(recorded("help-answer-system-prompt.txt"));
  });

  it("keeps the recorded person followup from the old help site byte for byte", () => {
    expect(PERSON_FOLLOWUP).toBe(recorded("help-answer-person-followup.txt"));
  });
});

describe("help answer request", () => {
  it("puts cache_control on the stable prompt only", () => {
    const request = buildAnswerRequest({
      articleContext,
      history: [],
      profile: {
        has_hypertask_account: "unknown",
        visitor_email: null,
        visitor_name: "Ada",
      },
      userContent: "current question",
    });

    expect(request.model).toBe("claude-haiku-5-5");
    expect(request.max_tokens).toBe(MAX_OUTPUT_TOKENS);
    expect(request.max_tokens).toBe(800);
    expect(request.stream).toBe(true);
    expect(request.thinking).toEqual({ type: "disabled" });
    expect(request.system).toHaveLength(3);
    expect(request.system[0]?.cache_control).toEqual({ type: "ephemeral" });
    expect(request.system[0]?.text).toContain("agent-ready board");
    expect(request.system[1]?.text).toBe(articleContext);
    expect(request.system[1]).not.toHaveProperty("cache_control");
    expect(request.system[2]?.text).toBe("Visitor: Ada");
    expect(request.system[2]).not.toHaveProperty("cache_control");
    expect(request.messages.at(-1)).toEqual({
      content: "current question",
      role: "user",
    });
  });

  it("keeps the last eight turns and drops a leading assistant turn", () => {
    const request = build({ history: turns(12) });

    expect(request.messages).toHaveLength(HISTORY_TURN_LIMIT + 1);
    expect(request.messages[0]?.content).toBe("turn-4");

    const assistantFirst = build({
      history: [
        { content: "old answer", role: "assistant" },
        { content: "question", role: "user" },
      ],
    });

    expect(assistantFirst.messages.map((message) => message.content)).toEqual([
      "question",
      "current question",
    ]);
  });

  it("merges consecutive turns with the same role and drops blank turns", () => {
    expect(
      trimConversation([
        { content: "first", role: "user" },
        { content: "   ", role: "assistant" },
        { content: "second", role: "user" },
        { content: "answer", role: "assistant" },
      ])
    ).toEqual([
      { content: "first\nsecond", role: "user" },
      { content: "answer", role: "assistant" },
    ]);
  });

  it("attaches a picture as a base64 block after the text", () => {
    const content = toAnswerUserContent(
      "What is this error?",
      "data:image/png;base64,iVBORw0KGgo=\nAAA"
    );

    expect(content).toEqual([
      { text: "What is this error?", type: "text" },
      {
        source: {
          data: "iVBORw0KGgo=AAA",
          media_type: "image/png",
          type: "base64",
        },
        type: "image",
      },
    ]);
  });

  it("keeps the old fallback wording for an empty message", () => {
    expect(toAnswerUserContent("   ")).toBe("Hello");
    expect(toAnswerUserContent("  ", "data:image/png;base64,AAAA")).toEqual([
      { text: "What is this image?", type: "text" },
      {
        source: { data: "AAAA", media_type: "image/png", type: "base64" },
        type: "image",
      },
    ]);
    expect(toAnswerUserContent("hi", "https://example.test/a.png")).toBe("hi");
  });

  it("adds the page note and the person followup without caching them", () => {
    const request = buildAnswerRequest({
      articleContext,
      history: [],
      page: { title: "Install the CLI", url: "https://docs.hypertask.ai/cli" },
      userContent: "Can I talk to a person?",
    });

    expect(request.system).toHaveLength(4);
    expect(request.system[2]?.text).toBe(
      "The visitor is reading this page right now:\nTitle: Install the CLI\nURL: https://docs.hypertask.ai/cli\nUse this when it helps the answer. Do not invent other pages."
    );
    expect(request.system[3]?.text).toBe(PERSON_FOLLOWUP);
    expect(request.system[1]?.text).toBe(articleContext);
    expect(request.system[0]?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("does not add the person followup for a coding agent question", () => {
    const request = build({ userContent: "Can I talk to my coding agent?" });

    expect(request.system).toHaveLength(2);
  });

  it("reads the visitor question out of a picture message", () => {
    const request = buildAnswerRequest({
      articleContext,
      history: [],
      userContent: toAnswerUserContent(
        "How do I connect Claude?",
        "data:image/png;base64,AAAA"
      ),
    });

    expect(request.messages.at(-1)).toEqual(
      toAnswerUserContent(
        "How do I connect Claude?",
        "data:image/png;base64,AAAA"
      )
    );
  });
});
