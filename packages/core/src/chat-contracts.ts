import { defineContract } from "@rat-stack/capability/contract";
import { Schema } from "effect";

import {
  MissingProfileFieldSchema,
  VisitorAccountSchema,
} from "./conversation-machine.js";
import type { MissingProfileField } from "./conversation-machine.js";

export const conversationNotFoundFailure = {
  error: "Conversation not found",
} as const;

export const profileConversationIdRequiredFailure = {
  error: "conversationId is required",
} as const;

export const profileAccountInvalidFailure = {
  error: "hasAccount must be one of: unknown, none, free, paid",
} as const;

export const profileFieldsMissingFailure = {
  error: "No profile fields provided",
} as const;

export const handoffEmailInvalidFailure = {
  error: "Invalid conversation or email",
} as const;

export const handoffEmailUnauthorizedFailure = {
  error: "Unauthorized",
} as const;

export const handoffEmailTooSoonFailure = {
  error: "Please wait before trying again",
} as const;

export const handoffProfileIncompleteFailure = (
  missing: readonly MissingProfileField[]
) =>
  ({
    error: "profile_incomplete",
    message: "Please provide your information before connecting with our team.",
    missing,
    requiresProfile: true,
  }) as const;

export const ConversationNotFound = Schema.Struct({
  error: Schema.Literal("Conversation not found"),
}).annotate({ httpApiStatus: 404 });

const ProfileConversationIdRequired = Schema.Struct({
  error: Schema.Literal("conversationId is required"),
}).annotate({ httpApiStatus: 400 });

const ProfileAccountInvalid = Schema.Struct({
  error: Schema.Literal("hasAccount must be one of: unknown, none, free, paid"),
}).annotate({ httpApiStatus: 400 });

const ProfileFieldsMissing = Schema.Struct({
  error: Schema.Literal("No profile fields provided"),
}).annotate({ httpApiStatus: 400 });

const HandoffProfileIncomplete = Schema.Struct({
  error: Schema.Literal("profile_incomplete"),
  message: Schema.Literal(
    "Please provide your information before connecting with our team."
  ),
  missing: Schema.Array(MissingProfileFieldSchema),
  requiresProfile: Schema.Literal(true),
}).annotate({ httpApiStatus: 400 });

const HandoffEmailInvalid = Schema.Struct({
  error: Schema.Literal("Invalid conversation or email"),
}).annotate({ httpApiStatus: 400 });

const HandoffEmailUnauthorized = Schema.Struct({
  error: Schema.Literal("Unauthorized"),
}).annotate({ httpApiStatus: 401 });

const HandoffEmailTooSoon = Schema.Struct({
  error: Schema.Literal("Please wait before trying again"),
}).annotate({ httpApiStatus: 429 });

export const VisitorProfileAnswerSchema = Schema.Struct({
  autoPopulated: Schema.Struct({
    account: Schema.optionalKey(VisitorAccountSchema),
    name: Schema.optionalKey(Schema.String),
  }),
  profile: Schema.Struct({
    email: Schema.NullOr(Schema.String),
    hasAccount: VisitorAccountSchema,
    name: Schema.NullOr(Schema.String),
    profileCompleted: Schema.Boolean,
  }),
  returningCustomer: Schema.Boolean,
  success: Schema.Literal(true),
});

export type VisitorProfileAnswer = typeof VisitorProfileAnswerSchema.Type;

export const HandoffAnswerSchema = Schema.Struct({
  status: Schema.Literal("handoff_requested"),
});

export type HandoffAnswer = typeof HandoffAnswerSchema.Type;

export const HandoffEmailAnswerSchema = Schema.Struct({
  emailed: Schema.Boolean,
  status: Schema.Literal("handoff_requested"),
});

export type HandoffEmailAnswer = typeof HandoffEmailAnswerSchema.Type;

export const saveVisitorProfileContract = defineContract("saveVisitorProfile", {
  description:
    "Save a visitor's name, email and Hypertask account type, and fill them in from a returning customer when only the email is known.",
  failure: Schema.Union([
    ProfileConversationIdRequired,
    ProfileAccountInvalid,
    ProfileFieldsMissing,
    ConversationNotFound,
  ]),
  http: { method: "POST", path: "/api/chat/profile" },
  input: Schema.Struct({
    conversationId: Schema.optionalKey(Schema.String),
    email: Schema.optionalKey(Schema.String),
    hasAccount: Schema.optionalKey(Schema.String),
    name: Schema.optionalKey(Schema.String),
  }),
  output: VisitorProfileAnswerSchema,
});

export const requestHandoffContract = defineContract("requestHandoff", {
  annotations: { openWorld: true },
  description:
    "Ask for a person on a conversation whose visitor left a name and an email, then raise the customer alert.",
  failure: Schema.Union([HandoffProfileIncomplete, ConversationNotFound]),
  http: { method: "POST", path: "/api/chat/handoff" },
  input: Schema.Struct({
    conversationId: Schema.optionalKey(Schema.String),
  }),
  output: HandoffAnswerSchema,
});

export const leaveHandoffEmailContract = defineContract("leaveHandoffEmail", {
  annotations: { openWorld: true },
  description:
    "Leave an email for a conversation the visitor owns, request a person, reply in the chat and email the team.",
  failure: Schema.Union([
    HandoffEmailInvalid,
    HandoffEmailUnauthorized,
    ConversationNotFound,
    HandoffEmailTooSoon,
  ]),
  http: { method: "POST", path: "/api/chat/handoff-email" },
  input: Schema.Struct({
    conversationId: Schema.optionalKey(Schema.String),
    email: Schema.optionalKey(Schema.String),
  }),
  output: HandoffEmailAnswerSchema,
});
