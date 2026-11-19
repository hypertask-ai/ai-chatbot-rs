import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import {
  AccessLogin,
  AdminPassword,
  adminFactsOf,
  adminIdentity,
  sameText,
} from "../src/admin-access.js";

const PASSWORD = "s3cret-value";

const loginThatAccepts =
  (accepted: string) =>
  (token: string): boolean =>
    token === accepted;

const accessLayer = (accepted: string, password: string) =>
  Layer.mergeAll(
    Layer.succeed(AdminPassword, password),
    Layer.succeed(AccessLogin, {
      verify: (token) => Effect.succeed(loginThatAccepts(accepted)(token)),
    })
  );

const bearerFacts = (authorization: string) => ({
  accessJwt: undefined,
  authorization,
});

const tokenFacts = (accessJwt: string) => ({
  accessJwt,
  authorization: undefined,
});

const anonymousFacts = { accessJwt: undefined, authorization: undefined };

describe("the admin login rule", () => {
  it("matches two texts of the same length and refuses everything else", () => {
    expect([
      sameText("Bearer s3cret-value", "Bearer s3cret-value"),
      sameText("Bearer s3cret-value", "Bearer s3cret-walue"),
      sameText("Bearer", "Bearer s3cret-value"),
      sameText("bearer s3cret-value", "Bearer s3cret-value"),
      sameText(undefined, "Bearer s3cret-value"),
    ]).toEqual([true, false, false, false, false]);
  });

  it.effect("grants admin to the password bearer", () =>
    Effect.gen(function* grantBearer() {
      const grant = yield* adminIdentity(
        bearerFacts(`Bearer ${PASSWORD}`)
      ).pipe(Effect.provide(accessLayer("good-token", PASSWORD)));

      expect(grant).toEqual(Option.some({ via: "bearer" }));
    })
  );

  it.effect("refuses a visitor bearer, a bare bearer and another scheme", () =>
    Effect.gen(function* refuseVisitorBearer() {
      const layer = accessLayer("good-token", PASSWORD);

      const visitor = yield* adminIdentity(
        bearerFacts("Bearer visitor-secret")
      ).pipe(Effect.provide(layer));

      const malformed = yield* adminIdentity(bearerFacts("Bearer")).pipe(
        Effect.provide(layer)
      );

      const otherScheme = yield* adminIdentity(
        bearerFacts("Basic YWRtaW46YWRtaW4=")
      ).pipe(Effect.provide(layer));

      expect([
        Option.isNone(visitor),
        Option.isNone(malformed),
        Option.isNone(otherScheme),
      ]).toEqual([true, true, true]);
    })
  );

  it.effect("refuses the empty bearer when no password is configured", () =>
    Effect.gen(function* refuseEmptyBearer() {
      const grant = yield* adminIdentity(bearerFacts("Bearer ")).pipe(
        Effect.provide(accessLayer("good-token", ""))
      );

      expect(Option.isNone(grant)).toBe(true);
    })
  );

  it.effect("grants admin to an Access token the access slice accepts", () =>
    Effect.gen(function* grantAccessToken() {
      const grant = yield* adminIdentity(tokenFacts("good-token")).pipe(
        Effect.provide(accessLayer("good-token", PASSWORD))
      );

      expect(grant).toEqual(Option.some({ via: "access" }));
    })
  );

  it.effect("refuses an Access token the access slice rejects", () =>
    Effect.gen(function* refuseAccessToken() {
      const grant = yield* adminIdentity(tokenFacts("not-a-token")).pipe(
        Effect.provide(accessLayer("good-token", PASSWORD))
      );

      expect(Option.isNone(grant)).toBe(true);
    })
  );

  it.effect("refuses a request with neither login", () =>
    Effect.gen(function* refuseAnonymous() {
      const grant = yield* adminIdentity(anonymousFacts).pipe(
        Effect.provide(accessLayer("good-token", PASSWORD))
      );

      expect(Option.isNone(grant)).toBe(true);
    })
  );

  it("reads both login headers from the request", () => {
    expect(
      adminFactsOf({
        authorization: "Bearer a",
        "cf-access-jwt-assertion": "b",
      })
    ).toEqual({ accessJwt: "b", authorization: "Bearer a" });

    expect(adminFactsOf({})).toEqual({
      accessJwt: undefined,
      authorization: undefined,
    });
  });
});
