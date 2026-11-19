import { DateTime, Option, Schema } from "effect";

import { widgetCopy } from "./copy.js";

export const ChatStamp = Schema.Union([Schema.Finite, Schema.String]);

export const ChatSession = Schema.Struct({
  created_at: Schema.optionalKey(Schema.NullOr(ChatStamp)),
  id: Schema.String,
  last_message: Schema.optionalKey(Schema.NullOr(Schema.String)),
  status: Schema.String,
  updated_at: Schema.optionalKey(Schema.NullOr(ChatStamp)),
});

export type ChatSessionValue = typeof ChatSession.Type;

export const ChatLine = Schema.Struct({
  content: Schema.String,
  role: Schema.Literals(["admin", "bot", "user"]),
});

export type ChatLineValue = typeof ChatLine.Type;

const millis = { day: 86_400_000, hour: 3_600_000, minute: 60_000 } as const;

const previewLimit = 50;

export const sessionStamp = (
  session: ChatSessionValue
): number | string | null | undefined =>
  session.updated_at ?? session.created_at;

export const sessionPreview = (
  lastMessage: string | null | undefined
): string => {
  const preview =
    lastMessage === null || lastMessage === undefined || lastMessage === ""
      ? widgetCopy.sessionNoMessages
      : lastMessage;

  return preview.length > previewLimit
    ? `${preview.slice(0, previewLimit)}...`
    : preview;
};

export const sessionTime = (
  stamp: number | string | null | undefined,
  nowMillis: number
): string => {
  const parsed = DateTime.make(stamp ?? "");

  if (Option.isNone(parsed)) {
    return widgetCopy.sessionInvalidTime;
  }

  const diffMillis = nowMillis - DateTime.toEpochMillis(parsed.value);
  const minutes = Math.floor(diffMillis / millis.minute);
  const hours = Math.floor(diffMillis / millis.hour);
  const days = Math.floor(diffMillis / millis.day);

  if (minutes < 1) {
    return widgetCopy.sessionJustNow;
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  if (hours < 24) {
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }

  if (days < 7) {
    return days === 1 ? widgetCopy.sessionYesterday : `${days} days ago`;
  }

  return DateTime.formatLocal(parsed.value, {
    day: "numeric",
    month: "short",
  });
};
