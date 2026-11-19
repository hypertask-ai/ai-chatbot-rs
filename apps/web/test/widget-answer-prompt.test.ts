import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";
import {
  Command as SceneCommand,
  Subscription,
  click,
  expect as sceneExpect,
  given as sceneGiven,
  keydown,
  placeholder,
  role,
  scene,
  selector,
  text,
  type as typeText,
} from "foldkit/scene";
import { Command, given, message, model, story } from "foldkit/story";

import {
  OpenCitedArticle,
  RequestHostClose,
  ScrollToLatest,
} from "../src/client/widget/command.js";
import { Message } from "../src/client/widget/message.js";
import { initialModel } from "../src/client/widget/model.js";
import type { AppModel, WidgetFlags } from "../src/client/widget/model.js";
import { update } from "../src/client/widget/update.js";
import { view } from "../src/features/widget/index.js";
import {
  answerActionsCopy,
  answerRowAfter,
  answerRowHidden,
  answerRowShownAt,
  answerRowVisible,
} from "../src/widget/answer-actions.js";

const flags = (overrides: Partial<WidgetFlags> = {}): WidgetFlags => ({
  docked: false,
  onHelpPage: false,
  pageTitle: "Boards & Sections",
  pageUrl: "https://hypertask.ai/help/boards-sections",
  pinned: false,
  ...overrides,
});

const home = initialModel(flags());

const box = placeholder("Ask a question…");

const answer = "Open the board, then press Export.";

const sourceLine = {
  href: "https://help.hypertask.ai/help/boards-sections",
  label: "From: Boards & Sections",
  slug: "boards-sections",
};

const citedAnswer = Message.ReceivedAnswer({
  answer,
  sources: [{ slug: "boards-sections", title: "Boards & Sections" }],
});

const answeredModel: AppModel = {
  ...home,
  answerRowAfter: Option.some(0),
  conversationId: "conv-9",
  messages: [
    { content: answer, imageUrl: Option.none(), role: "bot", sourceLine },
  ],
};

const scrollDone = Command.resolve(
  ScrollToLatest(),
  Message.CompletedScrollToLatest()
);

describe("the answer row, read from the old widget", () => {
  it("keeps the old words for the question, both buttons and both replies", () => {
    expect(answerActionsCopy.question).toBe("Did that answer it?");
    expect(answerActionsCopy.yes).toBe("Yes, thanks");
    expect(answerActionsCopy.person).toBe("Talk to a person");
    expect(answerActionsCopy.thanks).toBe("Thanks! Glad I could help.");
    expect(answerActionsCopy.handoffIntro).toBe(
      "Sure. A person from our team replies by email within one working day. They see this chat, so you don't need to repeat yourself."
    );
  });

  it("puts the row after the message it follows and hides it when no answer exists", () => {
    expect(answerRowAfter(0)).toBeNull();
    expect(answerRowAfter(1)).toBe(0);
    expect(answerRowAfter(3)).toBe(2);
    expect(answerRowHidden).toBeNull();
    expect(answerRowVisible(null, 2)).toBe(false);
    expect(answerRowVisible(1, 2)).toBe(true);
    expect(answerRowVisible(0, 1)).toBe(true);
    expect(answerRowVisible(2, 2)).toBe(false);
    expect(answerRowVisible(-1, 2)).toBe(false);
    expect(answerRowShownAt(1, 1)).toBe(true);
    expect(answerRowShownAt(1, 0)).toBe(false);
  });
});

describe("the answer row in the widget", () => {
  it("asks the question with both buttons after an answer, under the source line", () => {
    scene(
      { update, view },
      sceneGiven(home),
      sceneExpect(selector(".answer-actions")).toBeAbsent(),
      Subscription.emit(citedAnswer),
      sceneExpect(selector(".message.bot")).toExist(),
      sceneExpect(selector(".source-line")).toExist(),
      sceneExpect(role("link", { name: "From: Boards & Sections" })).toHaveAttr(
        "href",
        "https://help.hypertask.ai/help/boards-sections"
      ),
      sceneExpect(text("Did that answer it?")).toExist(),
      sceneExpect(role("button", { name: "Yes, thanks" })).toExist(),
      sceneExpect(role("button", { name: "Talk to a person" })).toExist(),
      SceneCommand.resolve(ScrollToLatest(), Message.CompletedScrollToLatest()),
      SceneCommand.expectNone()
    );
  });

  it("keeps the row and loses the source line when the answer cites nothing", () => {
    scene(
      { update, view },
      sceneGiven(home),
      Subscription.emit(
        Message.ReceivedAnswer({ answer: "Ask me again.", sources: [] })
      ),
      sceneExpect(selector(".source-line")).toBeAbsent(),
      sceneExpect(selector(".answer-actions")).toExist(),
      SceneCommand.resolve(ScrollToLatest(), Message.CompletedScrollToLatest()),
      SceneCommand.expectNone()
    );
  });

  it("shows no row and no message for an empty answer", () => {
    story(
      update,
      given(home),
      message(Message.ReceivedAnswer({ answer: "   ", sources: [] })),
      model((next) => {
        expect(next.messages).toEqual([]);
        expect(next.answerRowAfter).toEqual(Option.none());
      }),
      Command.expectNone()
    );
  });

  it("answers yes with the old thanks message", () => {
    story(
      update,
      given(answeredModel),
      message(Message.AcceptedAnswer()),
      model((next) => {
        expect(next.messages.at(-1)?.content).toBe(
          "Thanks! Glad I could help."
        );
        expect(next.answerRowAfter).toEqual(Option.none());
      }),
      scrollDone,
      Command.expectNone()
    );
  });

  it("takes the row away when the visitor answers yes", () => {
    scene(
      { update, view },
      sceneGiven(answeredModel),
      click(role("button", { name: "Yes, thanks" })),
      sceneExpect(selector(".answer-actions")).toBeAbsent(),
      SceneCommand.resolve(ScrollToLatest(), Message.CompletedScrollToLatest()),
      SceneCommand.expectNone()
    );
  });

  it("answers a person with the old two messages", () => {
    story(
      update,
      given(answeredModel),
      message(Message.AskedForPerson()),
      model((next) => {
        expect(next.messages.at(-2)?.content).toBe("Talk to a person");
        expect(next.messages.at(-1)?.content).toBe(
          "Sure. A person from our team replies by email within one working day. They see this chat, so you don't need to repeat yourself."
        );
        expect(next.answerRowAfter).toEqual(Option.none());
        expect(Option.isSome(next.handoffEmailCard)).toBe(true);
      }),
      scrollDone,
      Command.expectNone()
    );
  });

  it("opens the email card when the visitor asks for a person", () => {
    scene(
      { update, view },
      sceneGiven(answeredModel),
      click(role("button", { name: "Talk to a person" })),
      sceneExpect(selector(".answer-actions")).toBeAbsent(),
      sceneExpect(selector(".email-card")).toExist(),
      sceneExpect(text("Talk to a person")).toExist(),
      SceneCommand.resolve(ScrollToLatest(), Message.CompletedScrollToLatest()),
      SceneCommand.expectNone()
    );
  });

  it("does nothing for a person when there is no conversation yet", () => {
    story(
      update,
      given({ ...answeredModel, conversationId: "" }),
      message(Message.AskedForPerson()),
      model((next) => {
        expect(next.answerRowAfter).toEqual(Option.none());
        expect(next.handoffEmailCard).toEqual(Option.none());
        expect(next.messages).toHaveLength(1);
      }),
      Command.expectNone()
    );
  });

  it("drops the row when the visitor sends another question", () => {
    scene(
      { update, view },
      sceneGiven(answeredModel),
      typeText(box, "One more thing"),
      keydown(box, "Enter"),
      sceneExpect(selector(".answer-actions")).toBeAbsent(),
      SceneCommand.resolve(ScrollToLatest(), Message.CompletedScrollToLatest()),
      SceneCommand.expectNone()
    );
  });

  it("opens the article in a new tab from a page that is not the help site", () => {
    scene(
      { update, view },
      sceneGiven(answeredModel),
      click(role("link", { name: "From: Boards & Sections" })),
      SceneCommand.expectExact(
        OpenCitedArticle({ onHelpPage: false, slug: "boards-sections" })
      ),
      SceneCommand.resolve(
        OpenCitedArticle({ onHelpPage: false, slug: "boards-sections" }),
        Message.CompletedOpenCitedArticle()
      ),
      SceneCommand.expectNone()
    );
  });

  it("opens the article in the help reader and closes the panel on the help site", () => {
    scene(
      { update, view },
      sceneGiven({ ...answeredModel, onHelpPage: true }),
      click(role("link", { name: "From: Boards & Sections" })),
      SceneCommand.expectExact(
        OpenCitedArticle({ onHelpPage: true, slug: "boards-sections" }),
        RequestHostClose()
      ),
      SceneCommand.resolveAllExact(
        [
          OpenCitedArticle({ onHelpPage: true, slug: "boards-sections" }),
          Message.CompletedOpenCitedArticle(),
        ],
        [RequestHostClose(), Message.CompletedHostClose()]
      ),
      SceneCommand.expectNone()
    );
  });
});
