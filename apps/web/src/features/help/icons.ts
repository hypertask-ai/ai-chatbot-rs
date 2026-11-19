import type { Html, HtmlBuilder } from "foldkit/html";

import type { AppMessage } from "../../client/help/message.js";

type Builder = HtmlBuilder<AppMessage>;

const strokeIcon = (h: Builder, size: number, children: readonly Html[]) =>
  h.svg(
    [
      h.AriaHidden(true),
      h.Width(String(size)),
      h.Height(String(size)),
      h.ViewBox("0 0 24 24"),
      h.Fill("none"),
      h.Stroke("currentColor"),
      h.StrokeWidth("2"),
      h.StrokeLinecap("round"),
      h.StrokeLinejoin("round"),
    ],
    children
  );

export const chevronLeftIcon = (h: Builder): Html =>
  h.svg(
    [
      h.AriaHidden(true),
      h.Width("16"),
      h.Height("16"),
      h.ViewBox("0 0 24 24"),
      h.Fill("none"),
      h.Stroke("currentColor"),
      h.StrokeWidth("2"),
      h.StrokeLinecap("round"),
      h.StrokeLinejoin("round"),
    ],
    [h.path([h.D("m15 18-6-6 6-6")])]
  );

export const searchIcon = (h: Builder): Html =>
  strokeIcon(h, 16, [
    h.circle([h.Cx("11"), h.Cy("11"), h.R("8")]),
    h.path([h.D("m21 21-4.35-4.35")]),
  ]);

export const menuIcon = (h: Builder): Html =>
  h.svg(
    [
      h.AriaHidden(true),
      h.Width("24"),
      h.Height("24"),
      h.ViewBox("0 0 24 24"),
      h.Fill("none"),
      h.Stroke("currentColor"),
      h.StrokeWidth("2"),
      h.StrokeLinecap("round"),
      h.StrokeLinejoin("round"),
    ],
    [
      h.line([h.X1("3"), h.Y1("12"), h.X2("21"), h.Y2("12")]),
      h.line([h.X1("3"), h.Y1("6"), h.X2("21"), h.Y2("6")]),
      h.line([h.X1("3"), h.Y1("18"), h.X2("21"), h.Y2("18")]),
    ]
  );

export const thumbsUpIcon = (h: Builder): Html =>
  h.svg(
    [
      h.AriaHidden(true),
      h.Width("16"),
      h.Height("16"),
      h.ViewBox("0 0 24 24"),
      h.Fill("none"),
      h.Stroke("currentColor"),
      h.StrokeWidth("2"),
      h.StrokeLinecap("round"),
      h.StrokeLinejoin("round"),
    ],
    [
      h.path([h.D("M7 10v12")]),
      h.path([
        h.D(
          "M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"
        ),
      ]),
    ]
  );

export const thumbsDownIcon = (h: Builder): Html =>
  h.svg(
    [
      h.AriaHidden(true),
      h.Width("16"),
      h.Height("16"),
      h.ViewBox("0 0 24 24"),
      h.Fill("none"),
      h.Stroke("currentColor"),
      h.StrokeWidth("2"),
      h.StrokeLinecap("round"),
      h.StrokeLinejoin("round"),
    ],
    [
      h.path([h.D("M17 14V2")]),
      h.path([
        h.D(
          "M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"
        ),
      ]),
    ]
  );
