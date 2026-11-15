const read = () => document.title;

export const run = async () => {
  const title = read();
  await Promise.resolve(title);
};
