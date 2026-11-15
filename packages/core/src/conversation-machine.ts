import { setupEffect } from "@xstate/effect";
import { Data, Schema } from "effect";
import { initialTransition, transition, types } from "xstate";
import type { EventFromLogic, SnapshotFrom } from "xstate";

export const HANDOFF_REPEAT_WINDOW_SECONDS = 60;

export const ConversationStatusSchema = Schema.Literals([
  "bot",
  "handoff_requested",
  "human",
  "closed",
]);

export type ConversationStatus = typeof ConversationStatusSchema.Type;

export const VisitorAccountSchema = Schema.Literals([
  "unknown",
  "none",
  "free",
  "paid",
]);

export type VisitorAccount = typeof VisitorAccountSchema.Type;

export const ConversationEmailSchema = Schema.String.check(
  Schema.isNonEmpty(),
  Schema.isMaxLength(254),
  Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u)
);

export const VisitorProfileSchema = Schema.Struct({
  account: VisitorAccountSchema,
  email: Schema.UndefinedOr(Schema.String),
  name: Schema.UndefinedOr(Schema.String),
});

export type VisitorProfile = typeof VisitorProfileSchema.Type;

export const ConversationStateSchema = Schema.Struct({
  archived: Schema.Boolean,
  profile: VisitorProfileSchema,
  status: ConversationStatusSchema,
  updatedAt: Schema.Natural,
});

export type ConversationState = typeof ConversationStateSchema.Type;

export const MissingProfileFieldSchema = Schema.Literals(["name", "email"]);

export type MissingProfileField = typeof MissingProfileFieldSchema.Type;

export const ConversationRefusalSchema = Schema.Struct({
  missing: Schema.optionalKey(Schema.Array(MissingProfileFieldSchema)),
  reason: Schema.Literals(["profile_incomplete", "too_soon"]),
});

export type ConversationRefusal = typeof ConversationRefusalSchema.Type;

export type ConversationStep = Data.TaggedEnum<{
  Accepted: { readonly state: ConversationState };
  Refused: {
    readonly refusal: ConversationRefusal;
    readonly state: ConversationState;
  };
}>;

export const conversationStep = Data.taggedEnum<ConversationStep>();

export const ConversationInputSchema = Schema.Struct({
  now: Schema.Natural,
  profile: VisitorProfileSchema,
});

export type ConversationInput = typeof ConversationInputSchema.Type;

export const ConversationEventsSchema = {
  ADMIN_ACCEPTS: Schema.Struct({ at: Schema.Natural }),
  ADMIN_ARCHIVES: Schema.Struct({ at: Schema.Natural }),
  ADMIN_CLOSES: Schema.Struct({ at: Schema.Natural }),
  ADMIN_TAKES_OVER: Schema.Struct({ at: Schema.Natural }),
  ADMIN_UNARCHIVES: Schema.Struct({ at: Schema.Natural }),
  PROFILE_SAVED: Schema.Struct({
    account: Schema.optionalKey(VisitorAccountSchema),
    at: Schema.Natural,
    email: Schema.optionalKey(Schema.String),
    name: Schema.optionalKey(Schema.String),
  }),
  VISITOR_LEAVES_EMAIL: Schema.Struct({
    at: Schema.Natural,
    email: ConversationEmailSchema,
  }),
  VISITOR_MESSAGE: Schema.Struct({ at: Schema.Natural }),
  VISITOR_REQUESTS_PERSON: Schema.Struct({ at: Schema.Natural }),
};

interface ConversationContext {
  readonly archived: boolean;
  readonly profile: VisitorProfile;
  readonly refusal: ConversationRefusal | undefined;
  readonly updatedAt: number;
}

const isPresent = (value: string | undefined): boolean =>
  value !== undefined && value !== "";

const missingProfileFields = (
  profile: VisitorProfile
): readonly MissingProfileField[] => {
  const missing: MissingProfileField[] = [];

  if (!isPresent(profile.name)) {
    missing.push("name");
  }

  if (!isPresent(profile.email)) {
    missing.push("email");
  }

  return missing;
};

const nextContext = (
  context: ConversationContext,
  at: number,
  profile: VisitorProfile
): ConversationContext => ({
  archived: context.archived,
  profile,
  refusal: undefined,
  updatedAt: at,
});

const keep = (
  context: ConversationContext,
  at: number,
  profile: VisitorProfile = context.profile
) => ({ context: nextContext(context, at, profile) });

const move = (
  context: ConversationContext,
  status: ConversationStatus,
  at: number,
  profile: VisitorProfile = context.profile
) => ({ context: nextContext(context, at, profile), target: status });

const setArchived = (
  context: ConversationContext,
  archived: boolean,
  at: number
) => ({ context: { ...nextContext(context, at, context.profile), archived } });

const refuse = (
  context: ConversationContext,
  refusal: ConversationRefusal
) => ({
  context: { ...context, refusal },
});

export const conversationMachine = setupEffect({
  schemas: {
    context: types<ConversationContext>(),
    events: ConversationEventsSchema,
    input: ConversationInputSchema,
  },
}).createMachine({
  context: ({ input }) => ({
    archived: false,
    profile: input.profile,
    refusal: undefined,
    updatedAt: input.now,
  }),
  initial: "bot",
  on: {
    ADMIN_ACCEPTS: ({ context, event }) => move(context, "human", event.at),
    ADMIN_ARCHIVES: ({ context, event }) =>
      setArchived(context, true, event.at),
    ADMIN_CLOSES: ({ context, event }) => move(context, "closed", event.at),
    ADMIN_TAKES_OVER: ({ context, event }) => move(context, "human", event.at),
    ADMIN_UNARCHIVES: ({ context, event }) =>
      setArchived(context, false, event.at),
    PROFILE_SAVED: ({ context, event }) =>
      keep(context, event.at, {
        account: event.account ?? context.profile.account,
        email: event.email ?? context.profile.email,
        name: event.name ?? context.profile.name,
      }),
    VISITOR_LEAVES_EMAIL: ({ context, event }) =>
      move(context, "handoff_requested", event.at, {
        ...context.profile,
        email: event.email,
      }),
    VISITOR_MESSAGE: ({ context, event }) => keep(context, event.at),
    VISITOR_REQUESTS_PERSON: ({ context, event }) => {
      const missing = missingProfileFields(context.profile);

      return missing.length === 0
        ? move(context, "handoff_requested", event.at)
        : refuse(context, { missing, reason: "profile_incomplete" });
    },
  },
  states: {
    bot: {},
    closed: {},
    handoff_requested: {
      on: {
        VISITOR_LEAVES_EMAIL: ({ context, event }) =>
          context.updatedAt <= event.at - HANDOFF_REPEAT_WINDOW_SECONDS
            ? keep(context, event.at, {
                ...context.profile,
                email: event.email,
              })
            : refuse(context, { reason: "too_soon" }),
      },
    },
    human: {},
  },
});

export type ConversationSnapshot = SnapshotFrom<typeof conversationMachine>;

export type ConversationEvent = EventFromLogic<typeof conversationMachine>;

const decodeStatus = Schema.decodeUnknownSync(ConversationStatusSchema);

const conversationState = (
  snapshot: ConversationSnapshot
): ConversationState => ({
  archived: snapshot.context.archived,
  profile: snapshot.context.profile,
  status: decodeStatus(snapshot.value),
  updatedAt: snapshot.context.updatedAt,
});

export const startConversation = (
  input: ConversationInput
): ConversationState =>
  conversationState(initialTransition(conversationMachine, input)[0]);

export const stepConversation = (
  state: ConversationState,
  event: ConversationEvent
): ConversationStep => {
  const snapshot = conversationMachine.resolveState({
    context: {
      archived: state.archived,
      profile: state.profile,
      refusal: undefined,
      updatedAt: state.updatedAt,
    },
    value: state.status,
  });
  const [next] = transition(conversationMachine, snapshot, event);
  const { refusal } = next.context;
  const nextState = conversationState(next);

  return refusal === undefined
    ? conversationStep.Accepted({ state: nextState })
    : conversationStep.Refused({ refusal, state: nextState });
};
