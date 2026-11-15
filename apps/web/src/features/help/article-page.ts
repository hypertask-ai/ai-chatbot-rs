import type { Html, HtmlBuilder } from "foldkit/html";

import type { AppMessage } from "../../client/help/message.js";
import { Message } from "../../client/help/message.js";
import type { HelpPageValue } from "../../client/help/model.js";
import { classes, styleClass } from "./class-names.js";
import {
  appOrigin,
  articleHeaderNav,
  articleSearchLabel,
  backToHelpCenterLabel,
  feedbackNoLabel,
  feedbackQuestion,
  feedbackThanksLabel,
  feedbackYesLabel,
  helpCenterUrl,
  loginLabel,
  loginUrl,
  relatedTitle,
  startFreeLabel,
} from "./copy.js";
import {
  chevronLeftIcon,
  menuIcon,
  searchIcon,
  thumbsDownIcon,
  thumbsUpIcon,
} from "./icons.js";
import { helpArticle } from "./styles.stylex.js";

type Builder = HtmlBuilder<AppMessage>;

type ArticlePage = Extract<HelpPageValue, { readonly page: "article" }>;

const wordmarkUrl = "/hypertask_white.png";

const feedbackLabel = (
  icon: Html,
  label: string,
  given: boolean
): readonly (Html | string)[] =>
  given ? [feedbackThanksLabel] : [icon, label];

const feedbackButton = (
  h: HtmlBuilder<AppMessage>,
  sentiment: "no" | "yes",
  icon: Html,
  label: string,
  given: boolean
): Html =>
  h.button(
    [
      h.Class(styleClass(helpArticle.feedbackButton)),
      h.Type("button"),
      h.OnClick(Message.ArticleFeedbackGiven({ sentiment })),
    ],
    feedbackLabel(icon, label, given)
  );

const header = (h: Builder): Html =>
  h.header(
    [h.Class(styleClass(helpArticle.header))],
    [
      h.div(
        [h.Class(styleClass(helpArticle.headerContent))],
        [
          h.a(
            [h.Class(styleClass(helpArticle.logo)), h.Href(appOrigin)],
            [
              h.img([
                h.Class(styleClass(helpArticle.logoImage)),
                h.Src(wordmarkUrl),
                h.Alt("Hypertask"),
              ]),
            ]
          ),
          h.nav(
            [h.Class(styleClass(helpArticle.nav))],
            articleHeaderNav.map((link, index) =>
              h.a(
                [
                  h.Class(
                    classes(
                      styleClass(helpArticle.navLink),
                      index === articleHeaderNav.length - 1
                        ? styleClass(helpArticle.navLinkActive)
                        : null
                    )
                  ),
                  h.Href(link.href),
                ],
                [link.label]
              )
            )
          ),
          h.div(
            [h.Class(styleClass(helpArticle.navActions))],
            [
              h.a(
                [h.Class(styleClass(helpArticle.login)), h.Href(loginUrl)],
                [loginLabel]
              ),
              h.a(
                [h.Class(styleClass(helpArticle.cta)), h.Href(loginUrl)],
                [startFreeLabel]
              ),
              h.button(
                [
                  h.Class(styleClass(helpArticle.menuButton)),
                  h.AriaLabel("Menu"),
                ],
                [menuIcon(h)]
              ),
            ]
          ),
        ]
      ),
    ]
  );

const subHeader = (h: Builder): Html =>
  h.div(
    [h.Class(styleClass(helpArticle.subHeader))],
    [
      h.div(
        [h.Class(styleClass(helpArticle.subHeaderContent))],
        [
          h.a(
            [h.Class(styleClass(helpArticle.backLink)), h.Href(helpCenterUrl)],
            [chevronLeftIcon(h), backToHelpCenterLabel]
          ),
          h.a(
            [
              h.Class(styleClass(helpArticle.headerSearch)),
              h.Href(helpCenterUrl),
            ],
            [searchIcon(h), articleSearchLabel]
          ),
        ]
      ),
    ]
  );

const articleHeader = (h: Builder, page: ArticlePage): Html =>
  h.header(
    [h.Class(styleClass(helpArticle.titleBlock))],
    [
      h.span(
        [h.Class(styleClass(helpArticle.category))],
        [page.article.category]
      ),
      h.h1([h.Class(styleClass(helpArticle.title))], [page.article.title]),
      page.article.plansHtml === ""
        ? null
        : h.div([h.InnerHTML(page.article.plansHtml)]),
      page.article.excerpt === ""
        ? null
        : h.p(
            [h.Class(styleClass(helpArticle.excerpt))],
            [page.article.excerpt]
          ),
    ]
  );

const feedback = (
  h: Builder,
  page: ArticlePage,
  feedbackGiven: { no: boolean; yes: boolean }
): Html =>
  h.footer(
    [h.Class(styleClass(helpArticle.footer))],
    [
      h.p([h.Class(styleClass(helpArticle.feedbackText))], [feedbackQuestion]),
      h.div(
        [h.Class(styleClass(helpArticle.feedbackButtons))],
        [
          feedbackButton(
            h,
            "yes",
            thumbsUpIcon(h),
            feedbackYesLabel,
            feedbackGiven.yes
          ),
          feedbackButton(
            h,
            "no",
            thumbsDownIcon(h),
            feedbackNoLabel,
            feedbackGiven.no
          ),
        ]
      ),
    ]
  );

const related = (h: Builder, page: ArticlePage): Html =>
  page.related.length === 0
    ? null
    : h.div(
        [h.Class(styleClass(helpArticle.related))],
        [
          h.h3([h.Class(styleClass(helpArticle.relatedTitle))], [relatedTitle]),
          ...page.related.map((link) =>
            h.a(
              [
                h.Class(styleClass(helpArticle.relatedLink)),
                h.Href(`${helpCenterUrl}/${link.slug}`),
              ],
              [link.title]
            )
          ),
        ]
      );

export const helpArticleView = (
  page: ArticlePage,
  feedbackGiven: { readonly no: boolean; readonly yes: boolean },
  h: Builder
): Html =>
  h.div(
    [
      h.Class(
        classes(
          styleClass(helpArticle.main),
          "rat-help",
          "rat-help-article-theme"
        )
      ),
    ],
    [
      header(h),
      subHeader(h),
      h.article(
        [h.Class(styleClass(helpArticle.container))],
        [
          articleHeader(h, page),
          h.div([
            h.Class(
              classes(styleClass(helpArticle.body), "rat-help-article-body")
            ),
            h.InnerHTML(page.article.html),
          ]),
          feedback(h, page, feedbackGiven),
          related(h, page),
        ]
      ),
    ]
  );
