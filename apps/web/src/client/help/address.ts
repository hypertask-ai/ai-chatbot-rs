import { Option } from "effect";

import type { AppModel, HelpPageValue } from "./model.js";
import { emptySearch, initialModel } from "./model.js";

export type HelpAddress = Readonly<{
  hash: string;
  search: string;
}>;

type HelpCenterPage = Extract<HelpPageValue, { readonly page: "home" }>;

const paramOf = (address: HelpAddress, name: string): string | null => {
  const value = new URLSearchParams(address.search).get(name);

  return value === null || value === "" ? null : value;
};

const showsCategory = (page: HelpCenterPage, category: string): boolean =>
  page.articles.some((article) => article.category === category);

const searchFor = (
  page: HelpCenterPage,
  category: string | null,
  query: string | null
) => {
  if (query !== null) {
    return { input: query, query };
  }

  return category !== null && !showsCategory(page, category)
    ? { input: category, query: category }
    : emptySearch;
};

const atAddress = (page: HelpCenterPage, address: HelpAddress): AppModel => {
  const category = paramOf(address, "category");
  const query = paramOf(address, "q");
  const open = category !== null || query !== null || address.hash === "#all";
  const base = initialModel(page);

  return open
    ? {
        ...base,
        browser: {
          category:
            category === null ? base.browser.category : Option.some(category),
          open,
        },
        search: searchFor(page, category, query),
      }
    : base;
};

export const initialModelAtAddress = (
  page: HelpPageValue,
  address: HelpAddress
): AppModel =>
  page.page === "home" ? atAddress(page, address) : initialModel(page);
