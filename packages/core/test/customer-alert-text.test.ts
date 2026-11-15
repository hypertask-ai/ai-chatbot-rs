import { describe, expect, it } from "@effect/vitest";

import {
  CUSTOMER_ALERT_PREVIEW_LENGTH,
  customerAlertChatUrl,
  customerAlertMessagePreview,
  customerAlertText,
  customerAlertVisitorLabel,
  escapeCustomerAlertHtml,
} from "../src/customer-alert-text.js";
import type {
  CustomerAlert,
  NewConversationAlert,
} from "../src/customer-alerts.js";

const CHAT_URL = "https://help.hypertask.ai/admin#conv=conv-1";

const alert = (
  type: CustomerAlert["type"],
  value: CustomerAlert["alert"]
): CustomerAlert => ({ alert: value, type });

describe("customer alert text", () => {
  it("opens the chat the alert is about", () => {
    expect(customerAlertChatUrl("conv-1")).toBe(CHAT_URL);
  });

  it("announces a new conversation with its message and the open chat link", () => {
    expect(
      customerAlertText(
        alert("new_conversation", {
          conversationId: "conv-1",
          isEval: false,
          message: "Hello, I need help with billing",
        })
      )
    ).toBe(
      '<b>New Conversation</b>\n\nCustomer: Unknown visitor\nMessage: Hello, I need help with billing\n\n<a href="https://help.hypertask.ai/admin#conv=conv-1">Open Chat</a>'
    );
  });

  it("names the customer and the email on a handoff request", () => {
    expect(
      customerAlertText(
        alert("handoff_requested", {
          conversationId: "conv-1",
          isEval: false,
          visitorEmail: "ada@example.com",
          visitorName: "Ada",
        })
      )
    ).toBe(
      '<b>Handoff Requested</b>\n\nCustomer: Ada\nEmail: ada@example.com\n\n<a href="https://help.hypertask.ai/admin#conv=conv-1">Accept Handoff</a>'
    );
  });

  it("leaves the email line out of a handoff request with no email", () => {
    expect(
      customerAlertText(
        alert("handoff_requested", {
          conversationId: "conv-1",
          isEval: false,
          visitorEmail: null,
          visitorName: "Ada",
        })
      )
    ).toBe(
      '<b>Handoff Requested</b>\n\nCustomer: Ada\n\n<a href="https://help.hypertask.ai/admin#conv=conv-1">Accept Handoff</a>'
    );
  });

  it("calls an unnamed visitor Unknown visitor", () => {
    expect(
      customerAlertText(
        alert("handoff_requested", {
          conversationId: "conv-1",
          isEval: false,
          visitorEmail: null,
          visitorName: null,
        })
      )
    ).toBe(
      '<b>Handoff Requested</b>\n\nCustomer: Unknown visitor\n\n<a href="https://help.hypertask.ai/admin#conv=conv-1">Accept Handoff</a>'
    );
  });

  it("takes the email for the customer name when the name is empty", () => {
    expect(customerAlertVisitorLabel("", "ada@example.com")).toBe(
      "ada@example.com"
    );
    expect(customerAlertVisitorLabel(null, undefined)).toBe("Unknown visitor");
  });

  it("shows a new customer message with its sender and the reply link", () => {
    expect(
      customerAlertText(
        alert("new_message", {
          conversationId: "conv-1",
          isEval: false,
          message: "Where is my invoice?",
          visitorEmail: "ada@example.com",
          visitorName: "Ada",
        })
      )
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
    expect(customerAlertMessagePreview(undefined)).toBe("");
    expect(customerAlertMessagePreview("")).toBe("");
  });

  it("escapes the three characters Telegram HTML reserves", () => {
    expect(escapeCustomerAlertHtml("Ada & <Co>")).toBe("Ada &amp; &lt;Co&gt;");
    expect(
      customerAlertText(
        alert("new_message", {
          conversationId: "conv-1",
          isEval: false,
          message: "<b>not bold</b>",
          visitorEmail: null,
          visitorName: "Ada & Co",
        })
      )
    ).toBe(
      '<b>New Message</b>\n\nFrom: Ada &amp; Co\nMessage: &lt;b&gt;not bold&lt;/b&gt;\n\n<a href="https://help.hypertask.ai/admin#conv=conv-1">Reply</a>'
    );
  });

  it("builds the same text for an eval alert, which the sender then skips", () => {
    const data: NewConversationAlert = {
      conversationId: "conv-1",
      isEval: true,
      message: "Replay question",
    };

    expect(customerAlertText(alert("new_conversation", data))).toBe(
      customerAlertText(alert("new_conversation", { ...data, isEval: false }))
    );
    expect(customerAlertText(alert("new_conversation", data))).toContain(
      "Replay question"
    );
  });
});
