import type { CustomerAlert } from "./customer-alerts.js";

export const CUSTOMER_ALERT_CHAT_URL = "https://help.hypertask.ai/admin#conv=";

export const CUSTOMER_ALERT_UNKNOWN_VISITOR = "Unknown visitor";

export const CUSTOMER_ALERT_PREVIEW_LENGTH = 100;

export const customerAlertChatUrl = (conversationId: string): string =>
  `${CUSTOMER_ALERT_CHAT_URL}${conversationId}`;

export const escapeCustomerAlertHtml = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export const customerAlertVisitorLabel = (
  visitorName: string | null | undefined,
  visitorEmail: string | null | undefined
): string =>
  [visitorName, visitorEmail].find(
    (value) => value !== null && value !== undefined && value !== ""
  ) ?? CUSTOMER_ALERT_UNKNOWN_VISITOR;

export const customerAlertMessagePreview = (
  message: string | undefined
): string => {
  if (message === undefined || message === "") {
    return "";
  }

  const preview = message.slice(0, CUSTOMER_ALERT_PREVIEW_LENGTH);

  return message.length > CUSTOMER_ALERT_PREVIEW_LENGTH
    ? `${preview}...`
    : preview;
};

export const customerAlertText = (alert: CustomerAlert): string => {
  const url = customerAlertChatUrl(alert.alert.conversationId);

  switch (alert.type) {
    case "new_conversation":
      return `<b>New Conversation</b>\n\nCustomer: ${escapeCustomerAlertHtml(CUSTOMER_ALERT_UNKNOWN_VISITOR)}\nMessage: ${escapeCustomerAlertHtml(customerAlertMessagePreview(alert.alert.message))}\n\n<a href="${url}">Open Chat</a>`;
    case "handoff_requested": {
      const label = escapeCustomerAlertHtml(
        customerAlertVisitorLabel(
          alert.alert.visitorName,
          alert.alert.visitorEmail
        )
      );
      const email =
        alert.alert.visitorEmail === null || alert.alert.visitorEmail === ""
          ? ""
          : `\nEmail: ${escapeCustomerAlertHtml(alert.alert.visitorEmail)}`;

      return `<b>Handoff Requested</b>\n\nCustomer: ${label}${email}\n\n<a href="${url}">Accept Handoff</a>`;
    }
    case "new_message":
      return `<b>New Message</b>\n\nFrom: ${escapeCustomerAlertHtml(customerAlertVisitorLabel(alert.alert.visitorName, alert.alert.visitorEmail))}\nMessage: ${escapeCustomerAlertHtml(customerAlertMessagePreview(alert.alert.message))}\n\n<a href="${url}">Reply</a>`;
  }
};
