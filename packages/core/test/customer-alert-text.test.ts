import { describe, expect, it } from "@effect/vitest";

import {
  CUSTOMER_ALERT_PREVIEW_LENGTH,
  customerAlertChatUrl,
  customerAlertMessagePreview,
  customerAlertText,
  customerAlertVisitorLabel,
  escapeCustomerAlertHtml,
} from "../src/customer-alert-text.js";

const CHAT_URL = "https://help.hypertask.ai/admin#conv=conv-1";

const newConversationText = (
  message: string | undefined,
  isEval = false
): string =>
  customerAlertText({
    alert: { conversationId: "conv-1", isEval, message },
    type: "new_conversation",
  });

const handoffText = (
  visitorName: string | null,
  visitorEmail: string | null,
  isEval = false
): string =>
  customerAlertText({
    alert: { conversationId: "conv-1", isEval, visitorEmail, visitorName },
    type: "handoff_requested",
  });

const newMessageText = (
  visitorName: string | null,
  visitorEmail: string | null,
  message: string,
  isEval = false
): string =>
  customerAlertText({
    alert: {
      conversationId: "conv-1",
      isEval,
      message,
      visitorEmail,
      visitorName,
    },
    type: "new_message",
  });

describe("customer alert text", () => {
  it("opens the chat the alert is about", () => {
    expect(customerAlertChatUrl("conv-1")).toBe(CHAT_URL);
  });

  it("announces a new conversation with its message and the open chat link", () => {
    expect(newConversationText("Hello, I need help with billing")).toBe(
      '<b>New Conversation</b>\n\nCustomer: Unknown visitor\nMessage: Hello, I need help with billing\n\n<a href="https://help.hypertask.ai/admin#conv=conv-1">Open Chat</a>'
    );
  });

  it("names the customer and the email on a handoff request", () => {
    expect(handoffText("Ada", "ada@example.com")).toBe(
      '<b>Handoff Requested</b>\n\nCustomer: Ada\nEmail: ada@example.com\n\n<a href="https://help.hypertask.ai/admin#conv=conv-1">Accept Handoff</a>'
    );
  });

  it("leaves the email line out of a handoff request with no email", () => {
    expect(handoffText("Ada", null)).toBe(
      '<b>Handoff Requested</b>\n\nCustomer: Ada\n\n<a href="https://help.hypertask.ai/admin#conv=conv-1">Accept Handoff</a>'
    );
  });

  it("calls an unnamed visitor Unknown visitor", () => {
    expect(handoffText(null, null)).toBe(
      '<b>Handoff Requested</b>\n\nCustomer: Unknown visitor\n\n<a href="https://help.hypertask.ai/admin#conv=conv-1">Accept Handoff</a>'
    );
  });

  it("takes the email for the customer name when the name is empty", () => {
    expect(customerAlertVisitorLabel("", "ada@example.com")).toBe(
      "ada@example.com"
    );
    expect(customerAlertVisitorLabel(null)).toBe("Unknown visitor");
  });

  it("shows a new customer message with its sender and the reply link", () => {
    expect(
      newMessageText("Ada", "ada@example.com", "Where is my invoice?")
    ).toBe(
      '<b>New Message</b>\n\nFrom: Ada\nMessage: Where is my invoice?\n\n<a href="https://help.hypertask.ai/admin#conv=conv-1">Reply</a>'
    );
  });

  it("cuts a long message to 100 characters and three dots", () => {
    const long = "x".repeat(CUSTOMER_ALERT_PREVIEW_LENGTH + 1);

    expect(customerAlertMessagePreview(long)).toBe(
      `${"x".repeat(CUSTOMER_ALERT_PREVIEW_LENGTH)}...`
    );
  });

  it("keeps a message of exactly 100 characters whole", () => {
    const exact = "x".repeat(CUSTOMER_ALERT_PREVIEW_LENGTH);

    expect(customerAlertMessagePreview(exact)).toBe(exact);
  });

  it("shows an empty message as an empty line", () => {
    expect(customerAlertMessagePreview()).toBe("");
    expect(customerAlertMessagePreview("")).toBe("");
  });

  it("escapes the three characters Telegram HTML reserves", () => {
    expect(escapeCustomerAlertHtml("Ada & <Co>")).toBe("Ada &amp; &lt;Co&gt;");
    expect(newMessageText("Ada & Co", null, "<b>not bold</b>")).toBe(
      '<b>New Message</b>\n\nFrom: Ada &amp; Co\nMessage: &lt;b&gt;not bold&lt;/b&gt;\n\n<a href="https://help.hypertask.ai/admin#conv=conv-1">Reply</a>'
    );
  });

  it("builds the same text for an eval alert, which the sender then skips", () => {
    expect(newConversationText("Replay question", true)).toBe(
      newConversationText("Replay question", false)
    );
    expect(newConversationText("Replay question", true)).toContain(
      "Replay question"
    );
  });
});
