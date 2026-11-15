const label = (name) => name.replaceAll(" ", "-");

export const run = async () => label("a b");
