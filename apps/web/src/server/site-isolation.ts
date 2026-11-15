export const liveBindingNamesOnTestAddress = (
  basePath: string,
  bindingNames: readonly string[],
  testStoreBindingNames: readonly string[]
): readonly string[] =>
  basePath === ""
    ? []
    : bindingNames.filter((name) => !testStoreBindingNames.includes(name));

export const assertTestAddressIsolated = (
  basePath: string,
  bindingNames: readonly string[],
  testStoreBindingNames: readonly string[]
): void => {
  const reachable = liveBindingNamesOnTestAddress(
    basePath,
    bindingNames,
    testStoreBindingNames
  );

  if (reachable.length > 0) {
    throw new Error(
      `The test address can reach live bindings: ${reachable.join(", ")}. Both sites share help.hypertask.ai, so a page under /ratstack must never read or write the live chat data or call the real AI. Fix: point those bindings at a separate test store and name it in separateTestStoreBindingNames, or leave SITE_BASE_PATH empty.`
    );
  }
};
