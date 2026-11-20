import type { CustomerAlert } from "./customer-alerts.js";

export const CUSTOMER_ALERT_CHAT_URL = "https://help.hypertask.ai/admin#conv=";

export const CUSTOMER_ALERT_UNKNOWN_VISITOR = "Unknown visitor";

export const CUSTOMER_ALERT_PREVIEW_LENGTH = 100;

export const customerAlertChatUrl = (conversationId: string): string =>
  `${CUSTOMER_ALERT_CHAT_URL}${conversationId}`;

export const escapeCustomerAlertHtml = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export const customerAlertVisitorLabel = (
  visitorName?: string | null,
  visitorEmail?: string | null
): string =>
  [visitorName, visitorEmail].find(
    (value) => value !== null && value !== undefined && value !== ""
  ) ?? CUSTOMER_ALERT_UNKNOWN_VISITOR;

export const customerAlertMessagePreview = (message?: string): string => {
  if (message === undefined || message === "") {
    return "";
  }

  const preview = message.slice(0, CUSTOMER_ALERT_PREVIEW_LENGTH);

  return message.length > CUSTOMER_ALERT_PREVIEW_LENGTH
    ? `${preview}...`
    : preview;
};

const customerLine = (
  visitorName?: string | null,
  visitorEmail?: string | null
): string =>
  escapeCustomerAlertHtml(customerAlertVisitorLabel(visitorName, visitorEmail));

export const customerAlertText = (alert: CustomerAlert): string => {
  const url = customerAlertChatUrl(alert.alert.conversationId);

  switch (alert.type) {
    case "new_conversation": {
      const preview = customerAlertMessagePreview(alert.alert.message);

      return `<b>New Conversation</b>\n\nCustomer: ${CUSTOMER_ALERT_UNKNOWN_VISITOR}\nMessage: ${escapeCustomerAlertHtml(preview)}\n\n<a href="${url}">Open Chat</a>`;
    }

    case "handoff_requested": {
      const email = alert.alert.visitorEmail;

      return `<b>Handoff Requested</b>\n\nCustomer: ${customerLine(alert.alert.visitorName, alert.alert.visitorEmail)}${email === null || email === "" ? "" : `\nEmail: ${escapeCustomerAlertHtml(email)}`}\n\n<a href="${url}">Accept Handoff</a>`;
    }

    case "new_message": {
      const preview = customerAlertMessagePreview(alert.alert.message);

      return `<b>New Message</b>\n\nFrom: ${customerLine(alert.alert.visitorName, alert.alert.visitorEmail)}\nMessage: ${escapeCustomerAlertHtml(preview)}\n\n<a href="${url}">Reply</a>`;
    }

    default: {
      return alert satisfies never;
    }
  }
};
