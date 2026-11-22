export const parityUrl = ({
  base,
  path,
}: {
  readonly base: string;
  readonly path: string;
}): string =>
  new URL(path.replace(/^\/+/u, ""), `${base.replace(/\/+$/u, "")}/`).href;
