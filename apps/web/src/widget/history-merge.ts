export type HistoryLine = Readonly<{
  content: string;
  role: string;
}>;

export type MergedHistory = Readonly<{
  keptLocal: number;
  messages: readonly HistoryLine[];
}>;

export type ScreenLine = Readonly<{
  content: string;
  node?: unknown;
  role: string;
}>;

const line = (message: Partial<HistoryLine> | undefined): HistoryLine => ({
  content: String(message?.content ?? ""),
  role: String(message?.role ?? ""),
});

const same = (a: HistoryLine, b: HistoryLine): boolean =>
  a.role === b.role && a.content === b.content;

const sameAt = (
  a: HistoryLine | undefined,
  b: HistoryLine | undefined
): boolean => a !== undefined && b !== undefined && same(a, b);

export const mergeLoadedHistory = (
  server: readonly (HistoryLine | undefined)[] | undefined,
  onScreen: readonly (ScreenLine | undefined)[] | undefined
): MergedHistory => {
  const history = (server ?? []).map(line);
  const local = (onScreen ?? []).map(line);

  if (local.length === 0) {
    return { keptLocal: 0, messages: history };
  }

  const historyIsPrefix =
    history.length <= local.length &&
    history.every((item, index) => sameAt(item, local[index]));

  if (historyIsPrefix) {
    return { keptLocal: local.length - history.length, messages: local };
  }

  let overlap = 0;
  const max = Math.min(history.length, local.length);

  for (let n = max; n > 0; n -= 1) {
    const tail = history.slice(history.length - n);
    const matches = tail.every((item, index) => sameAt(item, local[index]));

    if (matches) {
      overlap = n;
      break;
    }
  }

  return {
    keptLocal: local.length - overlap,
    messages: [...history, ...local.slice(overlap)],
  };
};
