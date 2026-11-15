import * as stylex from "@stylexjs/stylex";
import type { Document, HtmlBuilder } from "foldkit/html";

import type { AppMessage } from "../../client/home/message.js";
import type { AppModel } from "../../client/home/model.js";
import { siteBasePath, siteBuilder } from "../../site-base.js";
import { pageTitle } from "./copy.js";
import { styles } from "./home.stylex.js";

const className = (style: stylex.StyleXStyles) =>
  stylex.props(style).className ?? "";

export const viewAt =
  (basePath: string) =>
  (_model: AppModel, h: HtmlBuilder<AppMessage>): Document => {
    const builder = siteBuilder(basePath, h);

    return {
      body: builder.main(
        [builder.Class(className(styles.page))],
        [builder.h1([builder.Class(className(styles.heading))], [pageTitle])]
      ),
      title: pageTitle,
    };
  };

export const view = viewAt(siteBasePath);
