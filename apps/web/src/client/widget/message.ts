import { Schema } from "effect";
import { File } from "foldkit/file";
import { defineMessageUnion } from "foldkit/message";

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
  AcceptedAnswer: {},
  AskedForPerson: {},
  AttachedImage: { dataUrl: Schema.String },
  ChangedHandoffEmail: { value: Schema.String },
  ChangedInput: { value: Schema.String },
  ClosedLightbox: {},
  ClosedPanel: {},
  CompletedEmailValidityCheck: {},
  CompletedHostClose: {},
  CompletedOpenCitedArticle: {},
  CompletedPublishSession: {},
  CompletedScrollToLatest: {},
  CompletedStoreSession: {},
  CompletedSyncChrome: {},
  HandoffEmailFailed: {},
  HandoffEmailSent: { emailed: Schema.Boolean },
  LoadedSession: {
    conversationId: Schema.String,
    sheet: Schema.Boolean,
    visitorId: Schema.String,
    visitorSecret: Schema.String,
  },
  OpenedCitedArticle: { slug: Schema.String },
  OpenedLightbox: { dataUrl: Schema.String },
  PickedSuggestion: { text: Schema.String },
  ReceivedAnswer: {
    answer: Schema.String,
    sources: Schema.Array(
      Schema.Struct({
        slug: Schema.String,
        title: Schema.optionalKey(Schema.NullOr(Schema.String)),
      })
    ),
  },
  ReceivedHostMessage: {
    data: Schema.Unknown,
    fromParent: Schema.Boolean,
    sameOrigin: Schema.Boolean,
  },
  RejectedAttachment: {},
  RemovedAttachment: {},
  Submitted: {},
  SubmittedHandoffEmail: {},
  TookFile: { file: File },
});

export type AppMessage = typeof Message.Type;
