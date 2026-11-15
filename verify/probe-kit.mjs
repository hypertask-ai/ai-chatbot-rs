const loadKit = async () => {
  const kit = await import("kit");

  return kit;
};

export const run = async () => {
  const kit = await loadKit();
  const browser = await kit.launch();

  await browser.close();
};
