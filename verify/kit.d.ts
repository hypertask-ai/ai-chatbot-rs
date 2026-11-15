declare module "kit" {
  export const launch: () => Promise<{ close: () => Promise<void> }>;
}
declare module "kit2" {
  export const open: (name: string) => Promise<string>;
}
