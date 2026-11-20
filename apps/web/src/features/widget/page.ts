import { Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import type { AppMessage } from "../../client/widget/message.js";
import { Message } from "../../client/widget/message.js";
import type {
  AppModel,
  TranscriptEntryValue,
} from "../../client/widget/model.js";
import {
  answerActionsCopy,
  answerRowShownAt,
  answerRowVisible,
} from "../../widget/answer-actions.js";
import {
  sessionPreview,
  sessionStamp,
  sessionTime,
} from "../../widget/chat-sessions.js";
import type { ChatSessionValue } from "../../widget/chat-sessions.js";
import { widgetCopy } from "../../widget/copy.js";
import { emailCardCopy } from "../../widget/email-card.js";
import { renderChatMarkdown } from "../../widget/markdown.js";
import type { SourceLine } from "../../widget/source-line.js";
import { classes, styleClass } from "./class-names.js";
import { styles } from "./styles.stylex.js";

const closeIcon = (h: HtmlBuilder<AppMessage>): Html =>
  h.svg(
    [
      h.ViewBox("0 0 24 24"),
      h.Fill("none"),
      h.Stroke("currentColor"),
      h.StrokeWidth("2"),
      h.StrokeLinecap("round"),
      h.StrokeLinejoin("round"),
      h.AriaHidden(true),
      h.Class(styleClass(styles.closeIcon)),
    ],
    [
      h.path([
        h.D("M18 6L6 18M6 6l12 12"),
        h.Class(styleClass(styles.closePathMobile)),
      ]),
      h.path([
        h.D("M6 9l6 6 6-6"),
        h.Class(styleClass(styles.closePathDesktop)),
      ]),
    ]
  );

const sendIcon = (h: HtmlBuilder<AppMessage>): Html =>
  h.svg(
    [
      h.ViewBox("0 0 24 24"),
      h.Fill("none"),
      h.Stroke("currentColor"),
      h.StrokeWidth("2.5"),
      h.StrokeLinecap("round"),
      h.StrokeLinejoin("round"),
      h.Class(styleClass(styles.sendIcon)),
    ],
    [
      h.line([h.X1("12"), h.Y1("19"), h.X2("12"), h.Y2("5")]),
      h.polyline([h.Points("5 12 12 5 19 12")]),
    ]
  );

const suggestionChevron = (h: HtmlBuilder<AppMessage>): Html =>
  h.svg(
    [
      h.ViewBox("0 0 24 24"),
      h.Fill("none"),
      h.Stroke("currentColor"),
      h.StrokeWidth("2"),
      h.StrokeLinecap("round"),
      h.StrokeLinejoin("round"),
      h.AriaHidden(true),
      h.Class(styleClass(styles.suggestionChevron)),
    ],
    [h.path([h.D("m9 18 6-6-6-6")])]
  );

const sessionChevron = (h: HtmlBuilder<AppMessage>): Html =>
  h.svg(
    [
      h.ViewBox("0 0 24 24"),
      h.Fill("none"),
      h.Stroke("currentColor"),
      h.StrokeWidth("2"),
      h.Class(classes("session-arrow", styleClass(styles.sessionArrow))),
    ],
    [h.polyline([h.Points("9 18 15 12 9 6")])]
  );

const bubbleIcon = (h: HtmlBuilder<AppMessage>): Html =>
  h.svg(
    [
      h.ViewBox("0 0 24 24"),
      h.Fill("none"),
      h.Stroke("currentColor"),
      h.StrokeWidth("1.5"),
      h.AriaHidden(true),
      h.Class(styleClass(styles.menuEmptyIcon)),
    ],
    [
      h.path([
        h.D("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"),
      ]),
    ]
  );

const plusIcon = (h: HtmlBuilder<AppMessage>): Html =>
  h.svg(
    [
      h.ViewBox("0 0 24 24"),
      h.Fill("none"),
      h.Stroke("currentColor"),
      h.StrokeWidth("2.5"),
      h.AriaHidden(true),
      h.Class(styleClass(styles.newConversationIcon)),
    ],
    [
      h.line([h.X1("12"), h.Y1("5"), h.X2("12"), h.Y2("19")]),
      h.line([h.X1("5"), h.Y1("12"), h.X2("19"), h.Y2("12")]),
    ]
  );

const headerLabel = (model: AppModel): string => {
  if (model.menu.kind !== "closed") {
    return widgetCopy.menuTitle;
  }

  return model.readOnly ? widgetCopy.pastChatTitle : widgetCopy.headerTitle;
};

const newConversationView = (h: HtmlBuilder<AppMessage>): Html =>
  h.button(
    [
      h.Id("newConvBtn"),
      h.Type("button"),
      h.Title(widgetCopy.newConversationLabel),
      h.OnClick(Message.StartedNewConversation()),
      h.Class(classes("new-conv-btn", styleClass(styles.newConversation))),
    ],
    [plusIcon(h), widgetCopy.newConversationText]
  );

const headerView = (model: AppModel, h: HtmlBuilder<AppMessage>): Html =>
  h.div(
    [h.Class(classes("header", styleClass(styles.header)))],
    [
      h.div(
        [h.Class(classes("header-left", styleClass(styles.headerLeft)))],
        [
          h.img([
            h.Src(widgetCopy.logoUrl),
            h.Alt(""),
            h.Class(classes("header-logo", styleClass(styles.headerLogo))),
          ]),
          h.div(
            [h.Class(classes("header-info", styleClass(styles.headerInfo)))],
            [
              h.div(
                [
                  h.Id("headerTitle"),
                  h.Class(
                    classes("header-title", styleClass(styles.headerTitle))
                  ),
                ],
                [headerLabel(model)]
              ),
              h.div(
                [
                  h.Class(
                    classes(
                      "header-subtitle",
                      styleClass(styles.headerSubtitle)
                    )
                  ),
                ],
                [
                  h.span([h.Class(styleClass(styles.subtitleDot))]),
                  widgetCopy.headerSubtitle,
                ]
              ),
            ]
          ),
        ]
      ),
      h.div(
        [h.Class(classes("header-right", styleClass(styles.headerRight)))],
        [
          ...(model.menu.kind === "closed" ? [] : [newConversationView(h)]),
          h.button(
            [
              h.Id("closeHeaderBtn"),
              h.Type("button"),
              h.Title(widgetCopy.closeLabel),
              h.AriaLabel(widgetCopy.closeLabel),
              h.OnClick(Message.ClosedPanel()),
              h.Class(
                classes(
                  "header-btn",
                  styleClass(styles.headerButton),
                  model.pinned || model.docked
                    ? styleClass(styles.hidden)
                    : undefined
                )
              ),
            ],
            [closeIcon(h)]
          ),
        ]
      ),
    ]
  );

const transcriptView = (
  entry: TranscriptEntryValue,
  h: HtmlBuilder<AppMessage>
): Html => {
  const image = Option.match(entry.imageUrl, {
    onNone: () => [],
    onSome: (imageUrl) => [
      h.img([
        h.Src(imageUrl),
        h.Alt("Attached image"),
        h.Class("message-image"),
        h.OnClick(Message.OpenedLightbox({ dataUrl: imageUrl })),
      ]),
    ],
  });

  if (entry.role === "user") {
    return h.div([h.Class("message user")], [entry.content, ...image]);
  }

  return h.div([
    h.Class(classes("message", entry.role)),
    h.InnerHTML(renderChatMarkdown(entry.content)),
  ]);
};

const welcomeView = (h: HtmlBuilder<AppMessage>): Html =>
  h.div(
    [
      h.Id("welcomeMsg"),
      h.Class(classes("welcome-msg", styleClass(styles.welcomeMessage))),
    ],
    [
      h.h1(
        [h.Class(styleClass(styles.welcomeHeading))],
        [widgetCopy.welcomeHeading]
      ),
      h.p([h.Class(styleClass(styles.welcomeBody))], [widgetCopy.welcomeBody]),
    ]
  );

const suggestionsView = (model: AppModel, h: HtmlBuilder<AppMessage>): Html =>
  h.div(
    [
      h.Id("suggestions"),
      h.Class(classes("suggestions", styleClass(styles.suggestions))),
    ],
    model.suggestions.map((suggestion, index) =>
      h.button(
        [
          h.Type("button"),
          h.OnClick(Message.PickedSuggestion({ text: suggestion })),
          h.Class(
            classes(
              "suggestion-btn",
              styleClass(styles.suggestionButton),
              index === 0 ? undefined : styleClass(styles.suggestionDivider)
            )
          ),
        ],
        [suggestion, suggestionChevron(h)]
      )
    )
  );

const emptyMessagesView = (
  model: AppModel,
  h: HtmlBuilder<AppMessage>
): readonly Html[] => {
  if (model.pastChat) {
    return [
      h.div(
        [h.Class(classes("welcome-msg", styleClass(styles.pastChatEmpty)))],
        [widgetCopy.pastChatEmpty]
      ),
    ];
  }

  return [welcomeView(h), suggestionsView(model, h)];
};

const sourceLineView = (source: SourceLine, h: HtmlBuilder<AppMessage>): Html =>
  h.div(
    [h.Class("source-line")],
    [
      h.a(
        [
          h.Href(source.href),
          h.Target("_blank"),
          h.Rel("noopener noreferrer"),
          h.OnClick(Message.OpenedCitedArticle({ slug: source.slug }), {
            defaultAction: "Prevent",
          }),
          h.Class(styleClass(styles.sourceLineLink)),
        ],
        [source.label]
      ),
    ]
  );

const answerActionsView = (h: HtmlBuilder<AppMessage>): Html =>
  h.div(
    [h.Class(classes("answer-actions", styleClass(styles.answerActions)))],
    [
      h.p(
        [h.Class(styleClass(styles.answerQuestion))],
        [answerActionsCopy.question]
      ),
      h.div(
        [h.Class(styleClass(styles.answerActionsRow))],
        [
          h.button(
            [
              h.Type("button"),
              h.OnClick(Message.AcceptedAnswer()),
              h.Class(classes("answer-yes", styleClass(styles.answerButton))),
            ],
            [answerActionsCopy.yes]
          ),
          h.button(
            [
              h.Type("button"),
              h.OnClick(Message.AskedForPerson()),
              h.Class(
                classes("answer-person", styleClass(styles.answerButton))
              ),
            ],
            [answerActionsCopy.person]
          ),
        ]
      ),
    ]
  );

const emailCardView = (model: AppModel, h: HtmlBuilder<AppMessage>): Html => {
  const card = Option.getOrNull(model.handoffEmailCard);

  return h.form(
    [
      h.Id("handoffEmailCard"),
      h.Class(classes("email-card", styleClass(styles.emailCard))),
      h.OnSubmit(Message.SubmittedHandoffEmail()),
    ],
    [
      h.label(
        [h.For("handoffEmail"), h.Class(styleClass(styles.emailLabel))],
        [emailCardCopy.label]
      ),
      h.input([
        h.Id("handoffEmail"),
        h.Name("email"),
        h.Type("email"),
        h.Required(true),
        h.Maxlength(254),
        h.Autocomplete("email"),
        h.Value(card?.email ?? ""),
        h.OnInput((value) => Message.ChangedHandoffEmail({ value })),
        h.Class(styleClass(styles.emailInput)),
      ]),
      h.button(
        [
          h.Type("submit"),
          h.Disabled(Option.isSome(model.pendingHandoffEmail)),
          h.Class(styleClass(styles.emailSubmit)),
        ],
        [emailCardCopy.submit]
      ),
      h.div(
        [
          h.Role("alert"),
          h.Class(classes("email-error", styleClass(styles.emailError))),
        ],
        [Option.getOrElse(model.handoffEmailError, () => "")]
      ),
    ]
  );
};

const messagesView = (model: AppModel, h: HtmlBuilder<AppMessage>): Html => {
  const placement = Option.getOrNull(model.answerRowAfter);
  const answerRowShown = answerRowVisible(placement, model.messages.length);

  const transcript = model.messages.flatMap((entry, index) => [
    transcriptView(entry, h),
    ...(entry.sourceLine === undefined
      ? []
      : [sourceLineView(entry.sourceLine, h)]),
    ...(answerRowShown && answerRowShownAt(placement, index)
      ? [answerActionsView(h)]
      : []),
  ]);

  return h.div(
    [
      h.Id("messages"),
      h.Class(classes("messages", styleClass(styles.messages))),
    ],
    [
      ...(model.messages.length === 0
        ? emptyMessagesView(model, h)
        : transcript),
      ...(Option.isSome(model.handoffEmailCard)
        ? [emailCardView(model, h)]
        : []),
      h.div([h.Id("chat-messages-end")]),
    ]
  );
};

const readOnlyBannerView = (h: HtmlBuilder<AppMessage>): Html =>
  h.div(
    [
      h.Id("readonlyBanner"),
      h.Class(classes("readonly-banner", styleClass(styles.readOnlyBanner))),
    ],
    [widgetCopy.readOnlyBanner]
  );

const menuEmptyView = (h: HtmlBuilder<AppMessage>): Html =>
  h.div(
    [
      h.Id("menuSessionsEmpty"),
      h.Class(
        classes("menu-sessions-empty", styleClass(styles.menuSessionsEmpty))
      ),
    ],
    [
      bubbleIcon(h),
      h.h3(
        [h.Class(styleClass(styles.menuEmptyHeading))],
        [widgetCopy.menuEmptyHeading]
      ),
      h.p([], [widgetCopy.menuEmptyBody]),
    ]
  );

const menuRowView = (
  model: AppModel,
  session: ChatSessionValue,
  h: HtmlBuilder<AppMessage>
): Html => {
  const current = session.id === model.conversationId;

  return h.button(
    [
      h.Type("button"),
      h.OnClick(
        Message.PickedMenuSession({
          sessionId: session.id,
          status: session.status,
        })
      ),
      h.Class(
        classes(
          "menu-session-item",
          styleClass(
            current ? styles.menuSessionItemCurrent : styles.menuSessionItem
          ),
          current ? "current" : undefined
        )
      ),
    ],
    [
      h.div(
        [
          h.Class(
            classes("session-content", styleClass(styles.sessionContent))
          ),
        ],
        [
          h.div(
            [
              h.Class(
                classes("session-preview", styleClass(styles.sessionPreview))
              ),
            ],
            [sessionPreview(session.last_message)]
          ),
          h.div(
            [h.Class(classes("session-time", styleClass(styles.sessionTime)))],
            [sessionTime(sessionStamp(session), model.menu.now)]
          ),
        ]
      ),
      sessionChevron(h),
    ]
  );
};

const menuView = (model: AppModel, h: HtmlBuilder<AppMessage>): Html =>
  h.div(
    [
      h.Id("menuView"),
      h.Class(classes("menu-view", styleClass(styles.menuView))),
    ],
    [
      h.div(
        [
          h.Id("menuSessionsList"),
          h.Class(
            classes("menu-sessions-list", styleClass(styles.menuSessionsList))
          ),
        ],
        model.menu.rows.length === 0
          ? [menuEmptyView(h)]
          : model.menu.rows.map((session) => menuRowView(model, session, h))
      ),
    ]
  );

const attachmentView = (dataUrl: string, h: HtmlBuilder<AppMessage>): Html =>
  h.div(
    [
      h.Id("attachmentPreview"),
      h.Class(
        classes(
          "attachment-preview visible",
          styleClass(styles.attachmentPreview)
        )
      ),
    ],
    [
      h.div(
        [
          h.Class(
            classes("attachment-thumb", styleClass(styles.attachmentThumb))
          ),
        ],
        [
          h.img([
            h.Id("attachmentImg"),
            h.Src(dataUrl),
            h.Alt(widgetCopy.attachmentPreviewAlt),
            h.Class(styleClass(styles.attachmentThumbImage)),
          ]),
          h.button(
            [
              h.Id("removeAttachment"),
              h.Type("button"),
              h.Title(widgetCopy.removeAttachmentLabel),
              h.AriaLabel(widgetCopy.removeAttachmentLabel),
              h.OnClick(Message.RemovedAttachment()),
              h.Class(
                classes(
                  "attachment-remove",
                  styleClass(styles.attachmentRemove)
                )
              ),
            ],
            [widgetCopy.closeText]
          ),
        ]
      ),
    ]
  );

const privacyView = (h: HtmlBuilder<AppMessage>): Html =>
  h.div(
    [h.Class(classes("privacy-notice", styleClass(styles.privacyNotice)))],
    [
      h.div(
        [
          h.Class(
            classes("privacy-tooltip", styleClass(styles.privacyTooltip))
          ),
        ],
        [
          widgetCopy.privacyLong,
          h.a(
            [
              h.Href(widgetCopy.privacyPolicyUrl),
              h.Target("_blank"),
              h.Rel("noopener noreferrer"),
              h.Class(styleClass(styles.privacyTooltipLink)),
            ],
            [widgetCopy.privacySeeLabel]
          ),
          ".",
        ]
      ),
      widgetCopy.privacyShort,
      h.a(
        [
          h.Href(widgetCopy.privacyPolicyUrl),
          h.Target("_blank"),
          h.Rel("noopener noreferrer"),
          h.Class(styleClass(styles.privacyLink)),
        ],
        [widgetCopy.privacyLinkLabel]
      ),
    ]
  );

const inputView = (model: AppModel, h: HtmlBuilder<AppMessage>): Html =>
  h.div(
    [
      h.Id("inputArea"),
      h.Class(classes("input-area", styleClass(styles.inputArea))),
    ],
    [
      h.div(
        [h.Class(classes("input-container", styleClass(styles.field)))],
        [
          ...(Option.isSome(model.attachment)
            ? [attachmentView(model.attachment.value, h)]
            : []),
          h.textarea([
            h.Id("input"),
            h.Value(model.input),
            h.Placeholder(widgetCopy.inputPlaceholder),
            h.Autocomplete("off"),
            h.Rows(1),
            h.OnInput((value) => Message.ChangedInput({ value })),
            h.OnKeyDownSelfPreventDefault((key, modifiers) =>
              key === "Enter" && !modifiers.shiftKey
                ? Option.some(Message.Submitted())
                : Option.none()
            ),
            h.Class(classes("input", styleClass(styles.textarea))),
          ]),
          h.button(
            [
              h.Id("send"),
              h.Type("button"),
              h.Title(widgetCopy.sendLabel),
              h.AriaLabel(widgetCopy.sendLabel),
              h.OnClick(Message.Submitted()),
              h.Class(classes("send-btn", styleClass(styles.sendButton))),
            ],
            [sendIcon(h)]
          ),
        ]
      ),
      h.input([
        h.Id("fileInput"),
        h.Type("file"),
        h.Accept("image/*"),
        h.Class(classes("file-input", styleClass(styles.fileInput))),
        h.OnFileChange((files) => {
          const file = files.at(0);

          return file === undefined
            ? Message.RejectedAttachment()
            : Message.TookFile({ file });
        }),
      ]),
      h.div(
        [h.Class(classes("takeover-note", styleClass(styles.takeoverNote)))],
        [widgetCopy.takeoverNote]
      ),
      privacyView(h),
    ]
  );

const chatView = (model: AppModel, h: HtmlBuilder<AppMessage>): Html =>
  h.div(
    [
      h.Id("chatView"),
      h.Class(classes("chat-view", styleClass(styles.chatView))),
    ],
    [
      ...(model.readOnly ? [readOnlyBannerView(h)] : []),
      messagesView(model, h),
      ...(model.readOnly ? [] : [inputView(model, h)]),
    ]
  );

const lightboxView = (dataUrl: string, h: HtmlBuilder<AppMessage>): Html =>
  h.div(
    [
      h.Id("lightbox"),
      h.Class(classes("lightbox", styleClass(styles.lightbox))),
      h.OnClick(Message.ClosedLightbox()),
    ],
    [
      h.button(
        [
          h.Id("lightboxClose"),
          h.Type("button"),
          h.AriaLabel(widgetCopy.closeLabel),
          h.OnClick(Message.ClosedLightbox()),
          h.Class(classes("lightbox-close", styleClass(styles.lightboxClose))),
        ],
        [widgetCopy.closeText]
      ),
      h.img([
        h.Id("lightboxImg"),
        h.Src(dataUrl),
        h.Alt(widgetCopy.lightboxAlt),
        h.Class(styleClass(styles.lightboxImage)),
      ]),
    ]
  );

export const pageView = (model: AppModel, h: HtmlBuilder<AppMessage>): Html =>
  h.div(
    [h.DataAttribute("widget-document", ""), h.Class(styleClass(styles.root))],
    [
      headerView(model, h),
      model.menu.kind === "closed" ? chatView(model, h) : menuView(model, h),
      ...(Option.isSome(model.lightbox)
        ? [lightboxView(model.lightbox.value, h)]
        : []),
    ]
  );
