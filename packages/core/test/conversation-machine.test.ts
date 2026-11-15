import { describe, expect, it } from "@effect/vitest";

import {
  HANDOFF_REPEAT_WINDOW_SECONDS,
  conversationStep,
  startConversation,
  stepConversation,
} from "../src/conversation-machine.js";
import type {
  ConversationEvent,
  ConversationRefusal,
  ConversationState,
  ConversationStatus,
  VisitorProfile,
} from "../src/conversation-machine.js";

const emptyProfile: VisitorProfile = {
  account: "unknown",
  email: undefined,
  name: undefined,
};

const completeProfile: VisitorProfile = {
  account: "free",
  email: "ada@example.com",
  name: "Ada",
};

const namedProfile: VisitorProfile = {
  account: "unknown",
  email: undefined,
  name: "Ada",
};

const emailedProfile: VisitorProfile = {
  account: "none",
  email: "ada@example.com",
  name: undefined,
};

const emailOnlyProfile: VisitorProfile = {
  account: "unknown",
  email: "ada@example.com",
  name: undefined,
};

const state = (
  status: ConversationStatus,
  profile: VisitorProfile,
  updatedAt: number,
  archived = false
): ConversationState => ({ archived, profile, status, updatedAt });

interface TransitionCase {
  readonly event: ConversationEvent;
  readonly expected: ConversationState;
  readonly from: ConversationState;
  readonly name: string;
  readonly refusal?: ConversationRefusal;
}

const cases: TransitionCase[] = [
  {
    event: { at: 100, type: "VISITOR_REQUESTS_PERSON" },
    expected: state("handoff_requested", completeProfile, 100),
    from: state("bot", completeProfile, 0),
    name: "a visitor with a complete profile asks for a person and leaves the bot",
  },
  {
    event: { at: 100, type: "VISITOR_REQUESTS_PERSON" },
    expected: state("handoff_requested", completeProfile, 100),
    from: state("human", completeProfile, 0),
    name: "asking for a person again moves a human conversation to handoff requested",
  },
  {
    event: { at: 100, type: "VISITOR_REQUESTS_PERSON" },
    expected: state("handoff_requested", completeProfile, 100),
    from: state("closed", completeProfile, 0),
    name: "asking for a person reopens a closed conversation to handoff requested",
  },
  {
    event: { at: 100, type: "VISITOR_REQUESTS_PERSON" },
    expected: state("bot", namedProfile, 0),
    from: state("bot", namedProfile, 0),
    name: "asking for a person without an email is refused and changes nothing",
    refusal: { missing: ["email"], reason: "profile_incomplete" },
  },
  {
    event: { at: 100, type: "VISITOR_REQUESTS_PERSON" },
    expected: state("bot", emailedProfile, 0),
    from: state("bot", emailedProfile, 0),
    name: "asking for a person without a name is refused and changes nothing",
    refusal: { missing: ["name"], reason: "profile_incomplete" },
  },
  {
    event: { at: 100, type: "VISITOR_REQUESTS_PERSON" },
    expected: state("bot", emptyProfile, 0),
    from: state("bot", emptyProfile, 0),
    name: "asking for a person with an empty profile refuses with both fields missing",
    refusal: {
      missing: ["name", "email"],
      reason: "profile_incomplete",
    },
  },
  {
    event: { at: 100, type: "VISITOR_REQUESTS_PERSON" },
    expected: state("handoff_requested", completeProfile, 100),
    from: state("handoff_requested", completeProfile, 0),
    name: "asking for a person again while waiting refreshes the request",
  },
  {
    event: {
      at: 100,
      email: "ada@example.com",
      type: "VISITOR_LEAVES_EMAIL",
    },
    expected: state("handoff_requested", emailedProfile, 100),
    from: state("bot", emptyProfile, 0),
    name: "leaving an email requests a handoff without a name",
  },
  {
    event: {
      at: 100,
      email: "ada@example.com",
      type: "VISITOR_LEAVES_EMAIL",
    },
    expected: state("handoff_requested", emailedProfile, 100),
    from: state("closed", emptyProfile, 0),
    name: "leaving an email reopens a closed conversation to handoff requested",
  },
  {
    event: {
      at: 100,
      email: "ada@example.com",
      type: "VISITOR_LEAVES_EMAIL",
    },
    expected: state("handoff_requested", completeProfile, 100),
    from: state("human", completeProfile, 0),
    name: "leaving an email moves a human conversation to handoff requested",
  },
  {
    event: {
      at: HANDOFF_REPEAT_WINDOW_SECONDS - 1,
      email: "ada@example.com",
      type: "VISITOR_LEAVES_EMAIL",
    },
    expected: state("handoff_requested", completeProfile, 0),
    from: state("handoff_requested", completeProfile, 0),
    name: "a second email inside the repeat window is refused and changes nothing",
    refusal: { reason: "too_soon" },
  },
  {
    event: {
      at: HANDOFF_REPEAT_WINDOW_SECONDS,
      email: "ada@example.com",
      type: "VISITOR_LEAVES_EMAIL",
    },
    expected: state("handoff_requested", completeProfile, 60),
    from: state("handoff_requested", completeProfile, 0),
    name: "a second email exactly at the repeat window is accepted",
  },
  {
    event: {
      at: HANDOFF_REPEAT_WINDOW_SECONDS + 1,
      email: "ada@example.com",
      type: "VISITOR_LEAVES_EMAIL",
    },
    expected: state("handoff_requested", completeProfile, 61),
    from: state("handoff_requested", completeProfile, 0),
    name: "a second email after the repeat window is accepted",
  },
  {
    event: { at: 100, type: "ADMIN_ACCEPTS" },
    expected: state("human", completeProfile, 100),
    from: state("bot", completeProfile, 0),
    name: "an admin accepting a handoff puts the conversation with a person",
  },
  {
    event: { at: 100, type: "ADMIN_ACCEPTS" },
    expected: state("human", completeProfile, 100),
    from: state("closed", completeProfile, 0),
    name: "an admin accepting a handoff on a closed conversation still moves it to a person",
  },
  {
    event: { at: 100, type: "ADMIN_ACCEPTS" },
    expected: state("human", completeProfile, 100, true),
    from: state("handoff_requested", completeProfile, 0, true),
    name: "accepting a handoff keeps the archived flag",
  },
  {
    event: { at: 100, type: "ADMIN_TAKES_OVER" },
    expected: state("human", namedProfile, 100),
    from: state("bot", namedProfile, 0),
    name: "an admin taking over from the bot puts the conversation with a person",
  },
  {
    event: { at: 100, type: "ADMIN_TAKES_OVER" },
    expected: state("human", completeProfile, 100),
    from: state("closed", completeProfile, 0),
    name: "an admin taking over a closed conversation still moves it to a person",
  },
  {
    event: { at: 100, type: "ADMIN_CLOSES" },
    expected: state("closed", completeProfile, 100),
    from: state("bot", completeProfile, 0),
    name: "an admin closing a bot conversation closes it",
  },
  {
    event: { at: 100, type: "ADMIN_CLOSES" },
    expected: state("closed", completeProfile, 100),
    from: state("handoff_requested", completeProfile, 0),
    name: "an admin closing a handoff requested conversation closes it",
  },
  {
    event: { at: 100, type: "ADMIN_CLOSES" },
    expected: state("closed", completeProfile, 100),
    from: state("human", completeProfile, 0),
    name: "an admin closing a conversation with a person closes it",
  },
  {
    event: { at: 100, type: "ADMIN_ARCHIVES" },
    expected: state("bot", completeProfile, 100, true),
    from: state("bot", completeProfile, 0),
    name: "an admin archiving a conversation keeps its bot status",
  },
  {
    event: { at: 100, type: "ADMIN_ARCHIVES" },
    expected: state("handoff_requested", completeProfile, 100, true),
    from: state("handoff_requested", completeProfile, 0),
    name: "an admin archiving a handoff requested conversation keeps its status",
  },
  {
    event: { at: 100, type: "ADMIN_UNARCHIVES" },
    expected: state("closed", completeProfile, 100),
    from: state("closed", completeProfile, 0, true),
    name: "an admin unarchiving a closed conversation keeps its status",
  },
  {
    event: { at: 100, type: "VISITOR_MESSAGE" },
    expected: state("closed", completeProfile, 100),
    from: state("closed", completeProfile, 0),
    name: "a visitor message on a closed conversation does not reopen it",
  },
  {
    event: { at: 100, type: "VISITOR_MESSAGE" },
    expected: state("handoff_requested", completeProfile, 100),
    from: state("handoff_requested", completeProfile, 0),
    name: "a visitor message while waiting for a person keeps handoff requested",
  },
  {
    event: { at: 100, type: "VISITOR_MESSAGE" },
    expected: state("human", completeProfile, 100),
    from: state("human", completeProfile, 0),
    name: "a visitor message with a person keeps the human status",
  },
  {
    event: {
      account: "paid",
      at: 100,
      email: "ada@example.com",
      name: "Ada",
      type: "PROFILE_SAVED",
    },
    expected: state(
      "bot",
      { account: "paid", email: "ada@example.com", name: "Ada" },
      100
    ),
    from: state("bot", emptyProfile, 0),
    name: "saving a full profile keeps the status and makes a handoff possible",
  },
  {
    event: { at: 100, email: "ada@example.com", type: "PROFILE_SAVED" },
    expected: state("bot", emailOnlyProfile, 100),
    from: state("bot", emptyProfile, 0),
    name: "saving an email alone leaves the name empty",
  },
  {
    event: { account: "paid", at: 100, type: "PROFILE_SAVED" },
    expected: state("bot", { ...emptyProfile, account: "paid" }, 100),
    from: state("bot", emptyProfile, 0),
    name: "saving an account alone changes only the account",
  },
  {
    event: { at: 100, name: "Ada", type: "PROFILE_SAVED" },
    expected: state("bot", namedProfile, 100),
    from: state("bot", emptyProfile, 0),
    name: "saving a name alone leaves the email empty",
  },
  {
    event: { at: 100, name: "Ada", type: "PROFILE_SAVED" },
    expected: state("handoff_requested", namedProfile, 100),
    from: state("handoff_requested", namedProfile, 0),
    name: "saving a profile while waiting for a person keeps handoff requested",
  },
];

describe("conversation status transitions", () => {
  it("a new conversation starts in the bot status with nothing archived", () => {
    expect(startConversation({ now: 0, profile: emptyProfile })).toStrictEqual(
      state("bot", emptyProfile, 0)
    );
  });

  it.each(cases)("$name", (testCase) => {
    const { refusal } = testCase;
    const step = stepConversation(testCase.from, testCase.event);

    expect(step.state).toStrictEqual(testCase.expected);

    if (refusal === undefined) {
      expect(conversationStep.$is("Accepted")(step)).toBe(true);

      return;
    }

    expect(step).toStrictEqual(
      conversationStep.Refused({ refusal, state: testCase.expected })
    );
  });
});
