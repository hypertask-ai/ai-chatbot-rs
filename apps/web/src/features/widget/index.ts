import type { Document, HtmlBuilder } from "foldkit/html";

import type { AppMessage } from "../../client/widget/message.js";
import type { AppModel } from "../../client/widget/model.js";
import { pageTitle } from "../../widget/copy.js";
import { pageView } from "./page.js";

export const view = (
  model: AppModel,
  h: HtmlBuilder<AppMessage>
): Document => ({
  body: pageView(model, h),
  title: pageTitle,
});
