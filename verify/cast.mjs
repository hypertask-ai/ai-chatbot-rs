/** @typedef {{ launch: () => Promise<{ close: () => Promise<void> }> }} BrowserKit */

const launchKit = async () => {
  const specifier = process.env.KIT_MODULE ?? "kit";
  /** @type {BrowserKit} */
  const kit = await import(specifier);

  return kit.launch();
};

export const run = async () => {
  const browser = await launchKit();

  await browser.close();
};
