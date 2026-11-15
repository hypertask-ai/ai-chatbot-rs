import type { Html, HtmlBuilder } from "foldkit/html";

import { Message } from "../../client/help/message.js";
import type { AppMessage } from "../../client/help/message.js";
import { ReaderPhase } from "../../client/help/model.js";
import type {
  HelpArticlePageValue,
  HelpPageValue,
  ReaderPhaseValue,
} from "../../client/help/model.js";
import { readerHidesLibrary } from "../../client/help/reader.js";
import { classes, styleClass } from "./class-names.js";
import {
  allArticlesLabel,
  appOrigin,
  attachLabel,
  browserTitle,
  chatLabel,
  clearSearchGlyph,
  clearSearchLabel,
  copyright,
  footerLinks,
  headerLinks,
  helpCenterUrl,
  heroMessageLabel,
  heroMessagePlaceholder,
  heroSubtitle,
  heroTitle,
  loginUrl,
  menuGlyph,
  menuLabel,
  openAppLabel,
  readerBackLabel,
  readerLoadFailedLabel,
  readerLoadingLabel,
  searchLabel,
  searchPlaceholder,
  sendLabel,
  suggestions,
  topics,
  topicsHeading,
} from "./copy.js";
import { chevronLeftIcon } from "./icons.js";
import { helpCenter } from "./styles.stylex.js";

type Builder = HtmlBuilder<AppMessage>;

type HelpCenterPage = Extract<HelpPageValue, { readonly page: "home" }>;

const glyphUrl = "/glyph-white.png";

const topicHref = (title: string) =>
  `?category=${encodeURIComponent(title)}#all`;

const topicList = (h: Builder): readonly Html[] =>
  topics.map(([title, description]) =>
    h.a(
      [h.Class(styleClass(helpCenter.topic)), h.Href(topicHref(title))],
      [
        h.strong([h.Class(styleClass(helpCenter.topicTitle))], [title]),
        h.p([h.Class(styleClass(helpCenter.topicBody))], [description]),
      ]
    )
  );

const allArticlesLink = (h: Builder): Html =>
  h.a(
    [h.Class(styleClass(helpCenter.topicsHeadingLink)), h.Href("#all")],
    [allArticlesLabel]
  );

const suggestionButtons = (h: Builder): readonly Html[] =>
  suggestions.map((suggestion, index) =>
    h.button(
      [
        h.Class(
          classes(
            styleClass(helpCenter.suggestion),
            index === suggestions.length - 1
              ? styleClass(helpCenter.suggestionLast)
              : null
          )
        ),
        h.Type("button"),
        h.DataAttribute("message", suggestion.message),
      ],
      [
        h.span(
          [h.Class(styleClass(helpCenter.desktopLabel))],
          [suggestion.desktop]
        ),
        suggestion.mobile === null
          ? null
          : h.span(
              [h.Class(styleClass(helpCenter.mobileLabel))],
              [suggestion.mobile]
            ),
      ]
    )
  );

const articleCards = (h: Builder, page: HelpCenterPage): readonly Html[] =>
  page.articles.map((article) =>
    h.a(
      [
        h.Class(styleClass(helpCenter.articleCard)),
        h.Href(`${helpCenterUrl}/${article.slug}`),
        h.DataAttribute("category", article.category),
      ],
      [
        h.div(
          [h.Class(styleClass(helpCenter.articleCardTitle))],
          [article.title]
        ),
        h.div(
          [h.Class(styleClass(helpCenter.articleCardMeta))],
          [
            h.span(
              [h.Class(styleClass(helpCenter.articleCardCategory))],
              [article.category]
            ),
          ]
        ),
        article.excerpt === ""
          ? null
          : h.p(
              [h.Class(styleClass(helpCenter.articleCardExcerpt))],
              [article.excerpt]
            ),
      ]
    )
  );

const header = (h: Builder): Html =>
  h.header(
    [h.Class(styleClass(helpCenter.header))],
    [
      h.div(
        [h.Class(styleClass(helpCenter.headerContent))],
        [
          h.a(
            [h.Class(styleClass(helpCenter.logo)), h.Href(appOrigin)],
            [
              h.img([
                h.Class(styleClass(helpCenter.logoImage)),
                h.Src(glyphUrl),
                h.Alt(""),
              ]),
              "Hypertask ",
              h.span([h.Class(styleClass(helpCenter.logoHelp))], ["Help"]),
            ]
          ),
          h.button(
            [
              h.Class(styleClass(helpCenter.menuToggle)),
              h.Type("button"),
              h.AriaLabel(menuLabel),
              h.AriaExpanded(false),
              h.AriaControls("headerLinks"),
            ],
            [menuGlyph]
          ),
          h.nav(
            [h.Class(styleClass(helpCenter.headerLinks)), h.Id("headerLinks")],
            [
              ...headerLinks.map((link) =>
                h.a(
                  [
                    h.Class(styleClass(helpCenter.headerLink)),
                    h.Href(link.href),
                  ],
                  [link.label]
                )
              ),
              h.a(
                [
                  h.Class(
                    classes(
                      styleClass(helpCenter.headerLink),
                      styleClass(helpCenter.openApp)
                    )
                  ),
                  h.Href(loginUrl),
                ],
                [openAppLabel]
              ),
            ]
          ),
        ]
      ),
    ]
  );

const hero = (h: Builder): Html =>
  h.section(
    [h.Class(styleClass(helpCenter.hero))],
    [
      h.h1([h.Class(styleClass(helpCenter.heroTitle))], [heroTitle]),
      h.p([h.Class(styleClass(helpCenter.subtitle))], [heroSubtitle]),
      h.form(
        [h.Class(styleClass(helpCenter.heroChat)), h.Id("heroChat")],
        [
          h.div(
            [h.Class(styleClass(helpCenter.chatLabel))],
            [h.span([h.Class(styleClass(helpCenter.chatDot))]), chatLabel]
          ),
          h.textarea([
            h.Class(styleClass(helpCenter.heroMessage)),
            h.Id("heroMessage"),
            h.AriaLabel(heroMessageLabel),
            h.Placeholder(heroMessagePlaceholder),
          ]),
          h.div(
            [h.Class(styleClass(helpCenter.chatActions))],
            [
              h.button(
                [
                  h.Class(styleClass(helpCenter.attach)),
                  h.Type("button"),
                  h.Id("heroAttach"),
                ],
                [attachLabel]
              ),
              h.input([
                h.Id("heroFile"),
                h.Type("file"),
                h.Accept("image/*"),
                h.Hidden(true),
              ]),
              h.button(
                [h.Class(styleClass(helpCenter.send)), h.Type("submit")],
                [sendLabel]
              ),
            ]
          ),
        ]
      ),
      h.div(
        [h.Class(styleClass(helpCenter.suggestions))],
        suggestionButtons(h)
      ),
    ]
  );

const topicSection = (h: Builder): Html =>
  h.section(
    [h.Class(styleClass(helpCenter.topics)), h.Id("topics")],
    [
      h.div(
        [h.Class(styleClass(helpCenter.topicsHeading))],
        [
          h.h2(
            [h.Class(styleClass(helpCenter.topicsHeadingTitle))],
            [topicsHeading]
          ),
          allArticlesLink(h),
        ]
      ),
      h.div([h.Class(styleClass(helpCenter.topicsGrid))], topicList(h)),
    ]
  );

const articleBrowser = (h: Builder, page: HelpCenterPage): Html =>
  h.section(
    [
      h.Class(styleClass(helpCenter.articleBrowser)),
      h.Id("all"),
      h.Hidden(true),
    ],
    [
      h.h2(
        [
          h.Class(styleClass(helpCenter.articleBrowserTitle)),
          h.Id("browserTitle"),
        ],
        [browserTitle]
      ),
      h.div(
        [h.Class(styleClass(helpCenter.searchContainer))],
        [
          h.input([
            h.Class(styleClass(helpCenter.searchInput)),
            h.Id("searchInput"),
            h.Type("search"),
            h.Placeholder(searchPlaceholder),
            h.AriaLabel(searchLabel),
            h.Autocomplete("off"),
          ]),
          h.button(
            [
              h.Class(styleClass(helpCenter.searchClear)),
              h.Id("searchClear"),
              h.Type("button"),
              h.AriaLabel(clearSearchLabel),
            ],
            [clearSearchGlyph]
          ),
        ]
      ),
      h.div([
        h.Class(styleClass(helpCenter.liveResults)),
        h.Id("liveSearchResults"),
      ]),
      h.div(
        [
          h.Class(styleClass(helpCenter.articlesRegion)),
          h.Id("categoriesContainer"),
        ],
        [
          h.div(
            [],
            [
              h.div(
                [h.Class(styleClass(helpCenter.articlesList))],
                articleCards(h, page)
              ),
            ]
          ),
        ]
      ),
    ]
  );

const footer = (h: Builder): Html =>
  h.footer(
    [h.Class(styleClass(helpCenter.footer))],
    [
      h.nav(
        [h.Class(styleClass(helpCenter.footerLinks))],
        footerLinks.map((link) =>
          h.a(
            [h.Class(styleClass(helpCenter.footerLink)), h.Href(link.href)],
            [link.label]
          )
        )
      ),
      h.p([h.Class(styleClass(helpCenter.footerCopyright))], [copyright]),
    ]
  );

const readerArticle = (
  h: Builder,
  page: HelpCenterPage,
  article: HelpArticlePageValue
): readonly Html[] => {
  const category =
    page.articles.find((card) => card.slug === article.slug)?.category ?? "";

  return [
    h.header(
      [h.Class(styleClass(helpCenter.readerHeader))],
      [
        category === ""
          ? null
          : h.span(
              [h.Class(styleClass(helpCenter.readerCategory))],
              [category]
            ),
        h.h1([h.Class(styleClass(helpCenter.readerTitle))], [article.title]),
        article.plansHtml === ""
          ? null
          : h.div([h.InnerHTML(article.plansHtml)]),
        article.excerpt === ""
          ? null
          : h.p(
              [h.Class(styleClass(helpCenter.readerExcerpt))],
              [article.excerpt]
            ),
      ]
    ),
    h.div([
      h.Class(
        classes(styleClass(helpCenter.readerContent), "rat-help-reader-content")
      ),
      h.InnerHTML(article.html),
    ]),
  ];
};

const readerLine = (h: Builder, label: string): Html =>
  h.p([h.Class(styleClass(helpCenter.readerLoading))], [label]);

const readerContent = (
  h: Builder,
  page: HelpCenterPage,
  phase: ReaderPhaseValue
): readonly Html[] =>
  ReaderPhase.match<readonly Html[]>(phase, {
    Closed: () => [],
    Failed: () => [readerLine(h, readerLoadFailedLabel)],
    Loading: () => [readerLine(h, readerLoadingLabel)],
    Open: ({ article }) => readerArticle(h, page, article),
  });

const reader = (
  h: HtmlBuilder<AppMessage>,
  page: HelpCenterPage,
  phase: ReaderPhaseValue
): Html =>
  h.div(
    [
      h.Class(classes(styleClass(helpCenter.reader), "rat-help-reader")),
      h.Id("reader"),
      ...(ReaderPhase.guards.Closed(phase) ? [h.Hidden(true)] : []),
    ],
    [
      h.div(
        [h.Class(styleClass(helpCenter.readerBar))],
        [
          h.button(
            [
              h.Class(styleClass(helpCenter.readerBack)),
              h.Type("button"),
              h.Id("readerBack"),
              h.OnClick(Message.ReaderClosed()),
            ],
            [chevronLeftIcon(h), readerBackLabel]
          ),
        ]
      ),
      h.div(
        [h.Class(styleClass(helpCenter.readerBody)), h.Id("readerBody")],
        readerContent(h, page, phase)
      ),
    ]
  );

export const helpCenterView = (
  page: HelpCenterPage,
  phase: ReaderPhaseValue,
  h: Builder
): Html =>
  h.div(
    [h.Class(classes(styleClass(helpCenter.shell), "rat-help"))],
    [
      h.div(
        [h.Id("helpMain")],
        [
          h.div(
            readerHidesLibrary(phase)
              ? [h.Id("libraryView"), h.Hidden(true)]
              : [h.Id("libraryView")],
            [
              header(h),
              hero(h),
              topicSection(h),
              articleBrowser(h, page),
              footer(h),
            ]
          ),
        ]
      ),
      reader(h, page, phase),
    ]
  );
