import { Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import type { AppMessage } from "../../client/help/message.js";
import { Message } from "../../client/help/message.js";
import type {
  HelpArticleCard,
  HelpBrowserValue,
  HelpPageValue,
  HelpSearchValue,
} from "../../client/help/model.js";
import {
  filterHelpArticles,
  helpSearchHits,
  helpVisitorQuery,
} from "../../client/help/search.js";
import { classes, styleClass } from "./class-names.js";
import {
  allArticlesLabel,
  appOrigin,
  articleFoundLabel,
  articlesFoundLabel,
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
  noResultsBody,
  noResultsTitle,
  openAppLabel,
  readerBackLabel,
  searchLabel,
  searchPlaceholder,
  sendLabel,
  suggestions,
  topics,
  topicsHeading,
} from "./copy.js";
import { chevronLeftIcon, documentIcon, noResultsIcon } from "./icons.js";
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
    [
      h.Class(styleClass(helpCenter.topicsHeadingLink)),
      h.Href("#all"),
      h.OnClick(Message.AllArticlesChosen()),
    ],
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

const articleCards = (
  h: Builder,
  articles: readonly HelpArticleCard[]
): readonly Html[] =>
  articles.map((article) =>
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

const highlightedTitle = (
  h: Builder,
  article: HelpArticleCard,
  query: string
): readonly (Html | string)[] => {
  const pieces: (Html | string)[] = [];
  let at = 0;

  for (const hit of helpSearchHits(article.title, query)) {
    if (hit.start > at) {
      pieces.push(article.title.slice(at, hit.start));
    }

    pieces.push(
      h.mark(
        [h.Class(styleClass(helpCenter.searchHighlight))],
        [article.title.slice(hit.start, hit.end)]
      )
    );
    at = hit.end;
  }

  if (at < article.title.length) {
    pieces.push(article.title.slice(at));
  }

  return pieces;
};

const searchResult = (
  h: Builder,
  article: HelpArticleCard,
  query: string
): Html =>
  h.a(
    [
      h.Class(styleClass(helpCenter.liveSearchItem)),
      h.Href(`${helpCenterUrl}/${article.slug}`),
    ],
    [
      h.div(
        [h.Class(styleClass(helpCenter.liveSearchItemIcon))],
        [documentIcon(h)]
      ),
      h.div(
        [h.Class(styleClass(helpCenter.liveSearchItemContent))],
        [
          h.div(
            [h.Class(styleClass(helpCenter.liveSearchItemTitle))],
            highlightedTitle(h, article, query)
          ),
          h.div(
            [h.Class(styleClass(helpCenter.liveSearchItemCategory))],
            [article.category]
          ),
          article.excerpt === ""
            ? null
            : h.div(
                [h.Class(styleClass(helpCenter.liveSearchItemExcerpt))],
                [article.excerpt]
              ),
        ]
      ),
    ]
  );

const searchResults = (
  h: Builder,
  articles: readonly HelpArticleCard[],
  query: string
): readonly Html[] => [
  h.div(
    [h.Class(styleClass(helpCenter.liveSearchHeader))],
    [
      h.span(
        [h.Class(styleClass(helpCenter.liveSearchTitle))],
        [
          h.strong(
            [h.Class(styleClass(helpCenter.liveSearchTitleCount))],
            [String(articles.length)]
          ),
          " ",
          articles.length === 1 ? articleFoundLabel : articlesFoundLabel,
        ]
      ),
    ]
  ),
  h.div(
    [h.Class(styleClass(helpCenter.liveSearchList))],
    articles.map((article) => searchResult(h, article, query))
  ),
];

const searchResultsEmpty = (h: Builder): Html =>
  h.div(
    [h.Class(styleClass(helpCenter.liveSearchNoResults))],
    [
      h.div(
        [h.Class(styleClass(helpCenter.liveSearchNoResultsIcon))],
        [noResultsIcon(h)]
      ),
      h.h3(
        [h.Class(styleClass(helpCenter.liveSearchNoResultsHeading))],
        [noResultsTitle]
      ),
      h.p(
        [h.Class(styleClass(helpCenter.liveSearchNoResultsBody))],
        [noResultsBody]
      ),
    ]
  );

const liveResultsBody = (
  h: Builder,
  page: HelpCenterPage,
  search: HelpSearchValue
): readonly Html[] => {
  const results = filterHelpArticles(page.articles, search.query);

  return results.length === 0
    ? [searchResultsEmpty(h)]
    : searchResults(h, results, search.query);
};

const liveResults = (
  h: Builder,
  page: HelpCenterPage,
  search: HelpSearchValue
): Html => {
  const searching = helpVisitorQuery(search.query) !== "";

  return h.div(
    [
      h.Class(
        styleClass(
          searching ? helpCenter.liveResultsShown : helpCenter.liveResultsHidden
        )
      ),
      h.Id("liveSearchResults"),
    ],
    searching ? liveResultsBody(h, page, search) : []
  );
};

const cardsIn = (
  page: HelpCenterPage,
  browser: HelpBrowserValue
): readonly HelpArticleCard[] =>
  Option.isNone(browser.category)
    ? page.articles
    : page.articles.filter(
        (article) => article.category === browser.category.value
      );

const articleBrowser = (
  h: Builder,
  page: HelpCenterPage,
  browser: HelpBrowserValue,
  search: HelpSearchValue
): Html => {
  const searching = helpVisitorQuery(search.query) !== "";

  return h.section(
    [
      h.Class(styleClass(helpCenter.articleBrowser)),
      h.Id("all"),
      h.Hidden(!browser.open),
    ],
    [
      h.h2(
        [
          h.Class(styleClass(helpCenter.articleBrowserTitle)),
          h.Id("browserTitle"),
        ],
        [
          Option.isNone(browser.category)
            ? browserTitle
            : browser.category.value,
        ]
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
            h.Value(search.input),
            h.OnInput((value) => Message.SearchEdited({ value })),
            h.OnKeyDown((key) => Message.SearchKeyPressed({ key })),
          ]),
          h.button(
            [
              h.Class(
                classes(
                  styleClass(helpCenter.searchClear),
                  styleClass(
                    searching
                      ? helpCenter.searchClearShown
                      : helpCenter.searchClearHidden
                  )
                )
              ),
              h.Id("searchClear"),
              h.Type("button"),
              h.AriaLabel(clearSearchLabel),
              h.OnClick(Message.SearchCleared()),
            ],
            [clearSearchGlyph]
          ),
        ]
      ),
      liveResults(h, page, search),
      h.div(
        [
          h.Class(
            classes(
              styleClass(helpCenter.articlesRegion),
              searching ? styleClass(helpCenter.articlesRegionSearching) : null
            )
          ),
          h.Id("categoriesContainer"),
        ],
        [
          h.div(
            [],
            [
              h.div(
                [h.Class(styleClass(helpCenter.articlesList))],
                articleCards(h, cardsIn(page, browser))
              ),
            ]
          ),
        ]
      ),
    ]
  );
};

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

const reader = (h: Builder): Html =>
  h.div(
    [h.Class(styleClass(helpCenter.reader)), h.Id("reader"), h.Hidden(true)],
    [
      h.div(
        [h.Class(styleClass(helpCenter.readerBar))],
        [
          h.button(
            [
              h.Class(styleClass(helpCenter.readerBack)),
              h.Type("button"),
              h.Id("readerBack"),
            ],
            [chevronLeftIcon(h), readerBackLabel]
          ),
        ]
      ),
      h.div([h.Class(styleClass(helpCenter.readerBody)), h.Id("readerBody")]),
    ]
  );

export const helpCenterView = (
  page: HelpCenterPage,
  browser: HelpBrowserValue,
  search: HelpSearchValue,
  h: Builder
): Html =>
  h.div(
    [h.Class(classes(styleClass(helpCenter.shell), "rat-help"))],
    [
      h.div(
        [h.Id("helpMain")],
        [
          h.div(
            [h.Id("libraryView")],
            [
              header(h),
              hero(h),
              topicSection(h),
              articleBrowser(h, page, browser, search),
              footer(h),
            ]
          ),
        ]
      ),
      reader(h),
    ]
  );
