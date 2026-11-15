import { Clock, Context } from "effect";
import type { Effect } from "effect";

export interface ChatRoomClockValue {
  readonly now: Effect.Effect<number>;
}

export const ChatRoomClock = Context.Reference<ChatRoomClockValue>(
  "@rat-stack/core/ChatRoomClock",
  {
    defaultValue: () => ({ now: Clock.currentTimeMillis }),
  }
);
