import { Message } from "../src/client/widget/message.js";
import type { AppMessage } from "../src/client/widget/message.js";
import type {
  ChatLineValue,
  ChatSessionValue,
} from "../src/widget/chat-sessions.js";

export type PastChatsFake = Readonly<{
  readonly lines: readonly ChatLineValue[];
  readonly loadedMenu: AppMessage;
  readonly loadedPastChat: AppMessage;
  readonly sessions: readonly ChatSessionValue[];
}>;

export const fakePastChats = (
  count: number,
  nowMillis: number
): PastChatsFake => {
  const sessions = Array.from(
    { length: count },
    (_, index): ChatSessionValue => {
      const stamp = nowMillis - (index + 1) * 60_000;

      return {
        created_at: stamp,
        id: `conv-${index + 1}`,
        last_message: `Question ${index + 1}`,
        status: "bot",
        updated_at: stamp,
      };
    }
  );

  const lines: readonly ChatLineValue[] = [
    { content: "How do I export tasks?", role: "user" },
    { content: "Open the board menu.", role: "bot" },
  ];

  return {
    lines,
    loadedMenu: Message.LoadedMenuSessions({ now: nowMillis, sessions }),
    loadedPastChat: Message.LoadedPastChat({ messages: lines }),
    sessions,
  };
};
