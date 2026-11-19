import { describe, expect, it } from "@effect/vitest";

import { shouldOfferHandoff } from "../src/handoff-offer.js";
import type { HandoffOfferInput } from "../src/handoff-offer.js";

const helpful = "Open a board and press N to create a task.";

const offer = (input: HandoffOfferInput): boolean => shouldOfferHandoff(input);

const earlier = ["How do I export tasks?", "Where is the export button?"];

describe("the handoff offer", () => {
  it("stays away on a normal answered question", () => {
    expect(
      offer({
        aiAnswer: helpful,
        previousUserMessages: [],
        priorBotAnswers: 0,
        userMessage: "How do I create a task?",
      })
    ).toBe(false);

    for (const userMessage of [
      "How do I get started?",
      "What are the limits of the Free plan?",
      "How much does Pro cost?",
      "Does Hypertask have a CLI or work with coding agents?",
      "How do I connect Slack?",
      "I can't log in",
    ]) {
      expect(
        offer({
          aiAnswer: helpful,
          previousUserMessages: ["unrelated earlier question"],
          priorBotAnswers: 3,
          userMessage,
        }),
        userMessage
      ).toBe(false);
    }
  });

  it("appears when the visitor asks for a person", () => {
    for (const userMessage of [
      "I want to talk to a human",
      "Can I speak to a person?",
      "Please connect me with support",
      "I need an agent",
      "I need a real person",
      "transfer me to an agent",
    ]) {
      expect(
        offer({
          aiAnswer: helpful,
          previousUserMessages: [],
          priorBotAnswers: 0,
          userMessage,
        }),
        userMessage
      ).toBe(true);
    }
  });

  it("does not confuse a coding agent question with a person", () => {
    expect(
      offer({
        aiAnswer: helpful,
        previousUserMessages: [],
        priorBotAnswers: 4,
        userMessage: "Can a coding agent talk to Hypertask?",
      })
    ).toBe(false);
  });

  it("appears when the answer itself says it does not know", () => {
    for (const aiAnswer of [
      "I don't know that.",
      "I do not know the answer to that.",
      "There is no matching article for this.",
      "I couldn't find an article about that.",
      "I don't have an article on that yet.",
      "I'm not sure.",
    ]) {
      expect(
        offer({
          aiAnswer,
          previousUserMessages: [],
          priorBotAnswers: 0,
          userMessage: "Where is the flux capacitor setting?",
        }),
        aiAnswer
      ).toBe(true);
    }
  });

  it("waits for two answers before a thumbs-down or a rephrase counts", () => {
    expect(
      offer({
        aiAnswer: helpful,
        previousUserMessages: earlier,
        priorBotAnswers: 1,
        userMessage: "How can I export tasks?",
      })
    ).toBe(false);
    expect(
      offer({
        aiAnswer: helpful,
        previousUserMessages: earlier,
        priorBotAnswers: 2,
        userMessage: "How can I export tasks?",
      })
    ).toBe(true);
    expect(
      offer({
        aiAnswer: helpful,
        previousUserMessages: earlier,
        priorBotAnswers: 1,
        userMessage: "👎",
      })
    ).toBe(false);
    expect(
      offer({
        aiAnswer: helpful,
        previousUserMessages: earlier,
        priorBotAnswers: 2,
        userMessage: "thumbs down",
      })
    ).toBe(true);
    expect(
      offer({
        aiAnswer: helpful,
        previousUserMessages: earlier,
        priorBotAnswers: 2,
        userMessage: "What is the Pro price?",
      })
    ).toBe(false);
  });

  it("never offers on a missing question and a helpful answer", () => {
    expect(offer({ aiAnswer: helpful })).toBe(false);
    expect(offer({})).toBe(false);
    expect(
      offer({ aiAnswer: "", previousUserMessages: [], priorBotAnswers: 9 })
    ).toBe(false);
  });

  it("treats every rephrase of the same words as the same question", () => {
    const previous = ["Can I export my tasks to a spreadsheet?"];

    for (const userMessage of [
      "How can I export tasks to a spreadsheet?",
      "Export my tasks to a spreadsheet please",
      "tasks export spreadsheet",
    ]) {
      expect(
        offer({
          aiAnswer: helpful,
          previousUserMessages: previous,
          priorBotAnswers: 2,
          userMessage,
        }),
        userMessage
      ).toBe(true);
    }
  });
});
