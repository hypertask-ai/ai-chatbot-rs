import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  ConversationStateSchema,
  ConversationStatusSchema,
  HANDOFF_REPEAT_WINDOW_SECONDS,
  VisitorAccountSchema,
  conversationStep,
  stepConversation,
} from "../src/conversation-machine.js";
import type {
  ConversationEvent,
  ConversationState,
  MissingProfileField,
  VisitorProfile,
} from "../src/conversation-machine.js";

const visitorEmail = "ada@example.com";

const emptyProfile: VisitorProfile = {
  account: "unknown",
  email: undefined,
  name: undefined,
};

const CommandKindSchema = Schema.Literals([
  "adminAccepts",
  "adminArchives",
  "adminCloses",
  "adminTakesOver",
  "adminUnarchives",
  "saveBoth",
  "saveEmail",
  "saveName",
  "visitorLeavesEmail",
  "visitorMessage",
  "visitorRequestsPerson",
]);

const CommandSchema = Schema.Struct({
  afterSeconds: Schema.Natural,
  kind: CommandKindSchema,
});

const ScenarioSchema = Schema.Struct({
  account: VisitorAccountSchema,
  name: Schema.NonEmptyString,
});

const commands = Arbitrary.array(Arbitrary.schema(CommandSchema), {
  maxLength: 24,
});

type Command = typeof CommandSchema.Type;

type Scenario = typeof ScenarioSchema.Type;

const isPresent = (value: string | undefined): boolean =>
  value !== undefined && value !== "";

const hasCompleteProfile = (profile: VisitorProfile): boolean =>
  isPresent(profile.name) && isPresent(profile.email);

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

const eventFor = (
  command: Command,
  at: number,
  scenario: Scenario
): ConversationEvent => {
  switch (command.kind) {
    case "adminAccepts": {
      return { at, type: "ADMIN_ACCEPTS" };
    }

    case "adminArchives": {
      return { at, type: "ADMIN_ARCHIVES" };
    }

    case "adminCloses": {
      return { at, type: "ADMIN_CLOSES" };
    }

    case "adminTakesOver": {
      return { at, type: "ADMIN_TAKES_OVER" };
    }

    case "adminUnarchives": {
      return { at, type: "ADMIN_UNARCHIVES" };
    }

    case "saveBoth": {
      return {
        account: scenario.account,
        at,
        email: visitorEmail,
        name: scenario.name,
        type: "PROFILE_SAVED",
      };
    }

    case "saveEmail": {
      return { at, email: visitorEmail, type: "PROFILE_SAVED" };
    }

    case "saveName": {
      return { at, name: scenario.name, type: "PROFILE_SAVED" };
    }

    case "visitorLeavesEmail": {
      return { at, email: visitorEmail, type: "VISITOR_LEAVES_EMAIL" };
    }

    case "visitorMessage": {
      return { at, type: "VISITOR_MESSAGE" };
    }

    case "visitorRequestsPerson": {
      return { at, type: "VISITOR_REQUESTS_PERSON" };
    }

    default: {
      return command.kind satisfies never;
    }
  }
};

const modelStep = (
  state: ConversationState,
  command: Command,
  at: number,
  scenario: Scenario
): ConversationState => {
  switch (command.kind) {
    case "adminAccepts":
    case "adminTakesOver": {
      return { ...state, status: "human", updatedAt: at };
    }

    case "adminArchives": {
      return { ...state, archived: true, updatedAt: at };
    }

    case "adminCloses": {
      return { ...state, status: "closed", updatedAt: at };
    }

    case "adminUnarchives": {
      return { ...state, archived: false, updatedAt: at };
    }

    case "saveBoth": {
      return {
        ...state,
        profile: {
          account: scenario.account,
          email: visitorEmail,
          name: scenario.name,
        },
        updatedAt: at,
      };
    }

    case "saveEmail": {
      return {
        ...state,
        profile: { ...state.profile, email: visitorEmail },
        updatedAt: at,
      };
    }

    case "saveName": {
      return {
        ...state,
        profile: { ...state.profile, name: scenario.name },
        updatedAt: at,
      };
    }

    case "visitorLeavesEmail": {
      const tooSoon =
        state.status === "handoff_requested" &&
        state.updatedAt > at - HANDOFF_REPEAT_WINDOW_SECONDS;

      return tooSoon
        ? state
        : {
            ...state,
            profile: { ...state.profile, email: visitorEmail },
            status: "handoff_requested",
            updatedAt: at,
          };
    }

    case "visitorMessage": {
      return { ...state, updatedAt: at };
    }

    case "visitorRequestsPerson": {
      return hasCompleteProfile(state.profile)
        ? { ...state, status: "handoff_requested", updatedAt: at }
        : state;
    }

    default: {
      return command.kind satisfies never;
    }
  }
};

const initial: ConversationState = {
  archived: false,
  profile: emptyProfile,
  status: "bot",
  updatedAt: 0,
};

describe("conversation status model", () => {
  it.prop(
    "every generated history matches the old help site status rules",
    { commands, scenario: ScenarioSchema },
    ({ commands: generated, scenario }) => {
      let clock = 0;
      let expected = initial;
      let actual = initial;

      for (const command of generated) {
        clock += command.afterSeconds;

        const step = stepConversation(
          actual,
          eventFor(command, clock, scenario)
        );
        const next = modelStep(expected, command, clock, scenario);

        expect(Schema.is(ConversationStateSchema)(step.state)).toBe(true);
        expect(Schema.is(ConversationStatusSchema)(step.state.status)).toBe(
          true
        );
        expect(step.state).toStrictEqual(next);

        if (command.kind === "visitorRequestsPerson") {
          const complete = hasCompleteProfile(expected.profile);

          expect(conversationStep.$is("Accepted")(step)).toBe(complete);

          if (!complete) {
            expect(step).toStrictEqual(
              conversationStep.Refused({
                refusal: {
                  missing: missingProfileFields(expected.profile),
                  reason: "profile_incomplete",
                },
                state: expected,
              })
            );
          }
        }

        expected = next;
        actual = step.state;
      }
    },
    { arbitrary: { runs: 200 } }
  );
});
