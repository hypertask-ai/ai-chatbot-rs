declare module "kit" {
  export const launch: () => Promise<{ close: () => Promise<void> }>;
}
