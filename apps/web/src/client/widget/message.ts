import { Schema } from "effect";
import { File } from "foldkit/file";
import { defineMessageUnion } from "foldkit/message";

import { ChatLine, ChatSession } from "../../widget/chat-sessions.js";

export const HostMessage = Schema.Union([
  Schema.Struct({
    isMobile: Schema.optionalKey(Schema.Boolean),
    type: Schema.Literal("chat-widget-opened"),
  }),
  Schema.Struct({
    docked: Schema.optionalKey(Schema.Boolean),
    isMobile: Schema.optionalKey(Schema.Boolean),
    pinned: Schema.optionalKey(Schema.Boolean),
    type: Schema.Literal("chat-widget-pinned"),
  }),
  Schema.Struct({
    docked: Schema.optionalKey(Schema.Boolean),
    isMobile: Schema.optionalKey(Schema.Boolean),
    type: Schema.Literal("chat-widget-docked"),
  }),
  Schema.Struct({
    isMobile: Schema.optionalKey(Schema.Boolean),
    type: Schema.Literal("chat-widget-mobile-changed"),
  }),
  Schema.Struct({
    pageTitle: Schema.optionalKey(Schema.String),
    pageUrl: Schema.optionalKey(Schema.String),
    type: Schema.Literal("chat-widget-page"),
  }),
  Schema.Struct({
    conversationId: Schema.optionalKey(Schema.String),
    docked: Schema.optionalKey(Schema.Boolean),
    isMobile: Schema.optionalKey(Schema.Boolean),
    pageTitle: Schema.optionalKey(Schema.String),
    pageUrl: Schema.optionalKey(Schema.String),
    type: Schema.Literal("chat-widget-boot"),
    visitorId: Schema.optionalKey(Schema.String),
    visitorSecret: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({ type: Schema.Literal("chat-viewport-fit") }),
  Schema.Struct({
    dataUrl: Schema.optionalKey(Schema.String),
    type: Schema.Literal("help-attachment"),
  }),
  Schema.Struct({
    message: Schema.optionalKey(Schema.String),
    type: Schema.Literal("send-suggestion"),
  }),
]);

export type HostMessageValue = typeof HostMessage.Type;

export const Message = defineMessageUnion({
  AttachedImage: { dataUrl: Schema.String },
  ChangedInput: { value: Schema.String },
  ClosedLightbox: {},
  ClosedPanel: {},
  CompletedHostClose: {},
  CompletedPublishSession: {},
  CompletedScrollToLatest: {},
  CompletedStoreSession: {},
  CompletedSyncChrome: {},
  LoadedMenuSessions: {
    now: Schema.Number,
    sessions: Schema.Array(ChatSession),
  },
  LoadedPastChat: { messages: Schema.Array(ChatLine) },
  LoadedSession: {
    conversationId: Schema.String,
    sheet: Schema.Boolean,
    visitorId: Schema.String,
    visitorSecret: Schema.String,
  },
  OpenedLightbox: { dataUrl: Schema.String },
  OpenedMenu: {},
  PickedMenuSession: { sessionId: Schema.String, status: Schema.String },
  PickedSuggestion: { text: Schema.String },
  ReceivedHostMessage: {
    data: Schema.Unknown,
    fromParent: Schema.Boolean,
    sameOrigin: Schema.Boolean,
  },
  RejectedAttachment: {},
  RejectedMenuSessions: {},
  RemovedAttachment: {},
  StartedNewConversation: {},
  Submitted: {},
  TookFile: { file: File },
});

export type AppMessage = typeof Message.Type;
