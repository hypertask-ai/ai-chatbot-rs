import type { Document, HtmlBuilder } from "foldkit/html";

import type { AppMessage } from "../../client/help/message.js";
import type { AppModel } from "../../client/help/model.js";
import { helpArticleView } from "./article-page.js";
import { articleTitleSuffix, helpCenterTitle } from "./copy.js";
import { helpCenterView } from "./help-center.js";

export const view = (model: AppModel, h: HtmlBuilder<AppMessage>): Document =>
  model.page.page === "home"
    ? {
        body: helpCenterView(model.page, model.browser, model.search, h),
        title: helpCenterTitle,
      }
    : {
        body: helpArticleView(model.page, model.feedback, h),
        title: `${model.page.article.title} - ${articleTitleSuffix}`,
      };
