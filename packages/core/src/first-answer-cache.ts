import { Context } from "effect";
import type { Effect } from "effect";

export interface FirstAnswerCacheOperations {
  readonly lookup: (question: string) => Effect.Effect<string | undefined>;
  readonly save: (question: string, response: string) => Effect.Effect<void>;
}

export class FirstAnswerCache extends Context.Service<
  FirstAnswerCache,
  FirstAnswerCacheOperations
>()("@rat-stack/core/FirstAnswerCache") {}
