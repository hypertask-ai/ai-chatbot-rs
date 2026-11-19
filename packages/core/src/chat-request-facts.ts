import { Context } from "effect";

export interface ChatRequestFactsValue {
  readonly clientKey: string;
  readonly evalToken: string | undefined;
}

export const ChatRequestFacts = Context.Reference<ChatRequestFactsValue>(
  "@rat-stack/core/ChatRequestFacts",
  { defaultValue: () => ({ clientKey: "unknown", evalToken: undefined }) }
);
