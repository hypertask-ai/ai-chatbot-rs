import * as stylex from "@stylexjs/stylex";

export const styleClass = (style: stylex.StyleXStyles): string =>
  stylex.props(style).className ?? "";

export const classes = (
  ...names: readonly (string | null | undefined)[]
): string =>
  names
    .filter((name) => name !== null && name !== undefined && name !== "")
    .join(" ");
