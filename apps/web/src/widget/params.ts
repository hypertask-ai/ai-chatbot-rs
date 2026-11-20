export type WidgetPageFlags = Readonly<{
  docked: boolean;
  onHelpPage: boolean;
  pageTitle: string;
  pageUrl: string;
  pinned: boolean;
}>;

export const widgetPageFlags = (search: string): WidgetPageFlags => {
  const params = new URLSearchParams(search);

  return {
    docked: params.get("docked") === "1",
    onHelpPage: params.get("context") === "help",
    pageTitle: params.get("pageTitle") ?? "",
    pageUrl: params.get("pageUrl") ?? "",
    pinned: params.get("pinned") === "1",
  };
};
