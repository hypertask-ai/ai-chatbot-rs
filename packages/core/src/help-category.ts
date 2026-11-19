const LEGACY_CATEGORY_NAMES = new Map<string, string>([
  ["cat-12128993", "Getting Started"],
  ["cat-12129602", "Boards & tickets"],
  ["cat-12130036", "Features & How-To"],
  ["cat-12130247", "AI & Productivity"],
  ["cat-12130248", "Settings & Preferences"],
  ["cat-12130250", "Keyboard Shortcuts"],
  ["General", "General"],
]);

export const helpCategoryName = (
  category: string | null | undefined
): string => {
  if (category === null || category === undefined || category === "") {
    return "General";
  }

  return LEGACY_CATEGORY_NAMES.get(category) ?? category;
};
