import { Clock, Context, Effect } from "effect";

export interface ChatClockValue {
  readonly now: Effect.Effect<number>;
}

export const ChatClock = Context.Reference<ChatClockValue>(
  "@rat-stack/core/ChatClock",
  {
    defaultValue: () => ({
      now: Clock.currentTimeMillis.pipe(
        Effect.map((millis) => Math.floor(millis / 1000))
      ),
    }),
  }
);
