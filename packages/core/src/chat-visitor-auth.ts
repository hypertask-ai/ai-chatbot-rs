import { Context, Effect } from "effect";

import { sha256Hex } from "./interest-services.js";

const bearerPattern = /^Bearer (?<token>\S+)$/u;

export const VISITOR_SECRET_MAX_LENGTH = 512;

export const readBearerToken = (
  authorization: string | undefined
): string | undefined =>
  authorization === undefined
    ? undefined
    : bearerPattern.exec(authorization)?.groups?.token;

export const hashVisitorSecret = Effect.fn("hashVisitorSecret")(
  function* hashVisitorSecret(secret: string) {
    return yield* sha256Hex(secret);
  }
);

export interface ChatVisitorAuthValue {
  readonly authorization: string | undefined;
}

export const ChatVisitorAuth = Context.Reference<ChatVisitorAuthValue>(
  "@rat-stack/core/ChatVisitorAuth",
  { defaultValue: () => ({ authorization: undefined }) }
);
