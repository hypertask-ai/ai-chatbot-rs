/** @param {string} name */
const label = (name) => name.replaceAll(" ", "-");

const loadKit = async () => {
  const kit = await import("kit");

  return kit;
};

export const run = async () => {
  const kit = await loadKit();
  const browser = await kit.launch();
  const text = label("a b");

  await browser.close();

  return text;
};
