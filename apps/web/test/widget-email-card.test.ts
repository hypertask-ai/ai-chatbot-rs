import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";
import {
  Command as SceneCommand,
  Subscription,
  expect as sceneExpect,
  given,
  role,
  scene,
  selector,
  text,
} from "foldkit/scene";
import {
  Command,
  given as storyGiven,
  message,
  model,
  story,
} from "foldkit/story";

import {
  ReportEmailValidity,
  ScrollToLatest,
} from "../src/client/widget/command.js";
import { Message } from "../src/client/widget/message.js";
import { initialModel } from "../src/client/widget/model.js";
import type { WidgetFlags } from "../src/client/widget/model.js";
import { update } from "../src/client/widget/update.js";
import { view } from "../src/features/widget/index.js";
import {
  emailCardCopy,
  emailProblem,
  emailSentMessage,
} from "../src/widget/email-card.js";

const flags: WidgetFlags = {
  docked: false,
  onHelpPage: false,
  pageTitle: "Boards & Sections",
  pageUrl: "https://hypertask.ai/help/boards-sections",
  pinned: false,
};

const cardModel = {
  ...initialModel(flags),
  conversationId: "conv-9",
  handoffEmailCard: Option.some({ email: "" }),
};

const filledCard = {
  ...cardModel,
  handoffEmailCard: Option.some({ email: "me@example.com" }),
};

const clearing = ReportEmailValidity({ problem: Option.none() });

const refuse = ReportEmailValidity({
  problem: Option.some("Enter a valid email address."),
});

describe("the email card, read from the old widget", () => {
  it("keeps the old label, button, check and messages", () => {
    expect(emailCardCopy.label).toBe("Your email");
    expect(emailCardCopy.submit).toBe("Send to the team");
    expect(emailCardCopy.invalid).toBe("Enter a valid email address.");
    expect(emailCardCopy.failed).toBe("Could not send. Please try again.");
    expect(emailProblem("me@example.com")).toBeNull();
    expect(emailProblem("  me@example.co.uk  ")).toBeNull();
    expect(emailProblem("")).toBe("Enter a valid email address.");
    expect(emailProblem("me@example")).toBe("Enter a valid email address.");
    expect(emailProblem("me example@test.com")).toBe(
      "Enter a valid email address."
    );
  });

  it("keeps both old replies after the team saves or sends the email", () => {
    expect(emailSentMessage("me@example.com", true)).toBe(
      "Sent. The team replies to me@example.com within one working day."
    );
    expect(emailSentMessage("me@example.com", false)).toBe(
      "Saved. The team will see this chat."
    );
  });
});

describe("the email card in the widget", () => {
  it("shows the same field, submit button and alert area", () => {
    scene(
      { update, view },
      given(cardModel),
      sceneExpect(selector(".email-card")).toExist(),
      sceneExpect(text("Your email")).toExist(),
      sceneExpect(selector("#handoffEmail")).toHaveAttr("type", "email"),
      sceneExpect(selector("#handoffEmail")).toHaveAttr("maxlength", "254"),
      sceneExpect(selector("#handoffEmail")).toHaveAttr(
        "autocomplete",
        "email"
      ),
      sceneExpect(role("button", { name: "Send to the team" })).toExist(),
      sceneExpect(selector(".email-error")).toHaveAttr("role", "alert"),
      sceneExpect(selector(".email-error")).toHaveText("")
    );
  });

  it("refuses a malformed address with the old browser message and sends nothing", () => {
    story(
      update,
      storyGiven({
        ...cardModel,
        handoffEmailCard: Option.some({ email: "me@example" }),
      }),
      message(Message.SubmittedHandoffEmail()),
      Command.expectExact(refuse),
      Command.resolve(refuse, Message.CompletedEmailValidityCheck()),
      model((next) => {
        expect(next.pendingHandoffEmail).toEqual(Option.none());
      }),
      Command.expectNone()
    );
  });

  it("leaves a valid address as one typed request the send step picks up", () => {
    story(
      update,
      storyGiven({
        ...cardModel,
        handoffEmailCard: Option.some({ email: " me@example.com " }),
      }),
      message(Message.SubmittedHandoffEmail()),
      model((next) => {
        expect(next.pendingHandoffEmail).toEqual(
          Option.some({ conversationId: "conv-9", email: "me@example.com" })
        );
      }),
      Command.expectNone()
    );
  });

  it("clears the old browser message while the visitor types", () => {
    story(
      update,
      storyGiven(filledCard),
      message(Message.ChangedHandoffEmail({ value: "me@example.com" })),
      Command.expectExact(clearing),
      Command.resolve(clearing, Message.CompletedEmailValidityCheck()),
      Command.expectNone()
    );
  });

  it("keeps the card and shows the old failure message when sending fails", () => {
    scene(
      { update, view },
      given({
        ...filledCard,
        pendingHandoffEmail: Option.some({
          conversationId: "conv-9",
          email: "me@example.com",
        }),
      }),
      Subscription.emit(Message.HandoffEmailFailed()),
      sceneExpect(selector(".email-card")).toExist(),
      sceneExpect(selector(".email-error")).toHaveText(
        "Could not send. Please try again."
      ),
      sceneExpect(role("button", { name: "Send to the team" })).toBeEnabled()
    );
  });

  it("removes the card and thanks the visitor by email when the team sends it", () => {
    scene(
      { update, view },
      given(filledCard),
      Subscription.emit(Message.HandoffEmailSent({ emailed: true })),
      sceneExpect(selector(".email-card")).toBeAbsent(),
      sceneExpect(
        text("Sent. The team replies to me@example.com within one working day.")
      ).toExist(),
      SceneCommand.resolve(
        ScrollToLatest(),
        Message.CompletedScrollToLatest()
      ),
      SceneCommand.expectNone()
    );
  });

  it("uses the saved reply when no email went out", () => {
    scene(
      { update, view },
      given(filledCard),
      Subscription.emit(Message.HandoffEmailSent({ emailed: false })),
      sceneExpect(text("Saved. The team will see this chat.")).toExist(),
      SceneCommand.resolve(
        ScrollToLatest(),
        Message.CompletedScrollToLatest()
      ),
      SceneCommand.expectNone()
    );
  });
});
