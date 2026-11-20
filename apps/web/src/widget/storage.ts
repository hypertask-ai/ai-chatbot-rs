export const hostStorageKeys = {
  conversation: "hypertask_chat_conversation_id",
  dockCollapsed: "hypertask-chat-dock-collapsed",
  visitor: "hypertask_chat_visitor_id",
  visitorSecret: "hypertask_chat_visitor_secret",
} as const;

export const frameStorageKeys = {
  conversation: "chat_conversation_id",
  visitor: "chat_visitor_id",
  visitorSecret: "chat_visitor_secret",
} as const;

export const proactiveDismissPrefix = "chat-bubble-dismissed-";

export const dockCollapsedValue = (collapsed: boolean): string =>
  collapsed ? "1" : "0";
