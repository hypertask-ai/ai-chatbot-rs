import { Context, Effect, Schema } from "effect";

export const Unauthorized = Schema.Struct({
  error: Schema.Literal("Unauthorized"),
}).annotate({ httpApiStatus: 401 });

export type UnauthorizedValue = typeof Unauthorized.Type;

export interface AdminRequestFacts {
  readonly accessJwt: string | undefined;
  readonly authorization: string | undefined;
}

export interface AdminHeaderSource {
  readonly "cf-access-jwt-assertion"?: string | undefined;
  readonly authorization?: string | undefined;
}

export interface AdminRequestSource {
  readonly headers: AdminHeaderSource;
}

export interface AdminGrant {
  readonly via: "access" | "bearer";
}

export interface AccessLoginValue {
  readonly verify: (token: string) => Effect.Effect<boolean>;
}

export const AdminPassword = Context.Reference<string>(
  "@rat-stack/core/AdminPassword",
  { defaultValue: () => "" }
);

export const AccessLogin = Context.Reference<AccessLoginValue>(
  "@rat-stack/core/AccessLogin",
  {
    defaultValue: () => ({
      verify: () => Effect.succeed(false),
    }),
  }
);

export class Admin extends Context.Service<AdminGrant, AdminGrant>()(
  "@rat-stack/core/Admin"
) {}

export const adminFactsOf = (
  headers: AdminHeaderSource
): AdminRequestFacts => ({
  accessJwt: headers["cf-access-jwt-assertion"],
  authorization: headers.authorization,
});

export const sameText = (left: string | undefined, right: string): boolean => {
  if (left === undefined) {
    return false;
  }

  const provided = new TextEncoder().encode(left);
  const expected = new TextEncoder().encode(right);
  const length = Math.max(provided.length, expected.length);

  let mismatch = provided.length === expected.length ? 0 : 1;

  for (let index = 0; index < length; index += 1) {
    mismatch += (provided[index] ?? 0) === (expected[index] ?? 0) ? 0 : 1;
  }

  return mismatch === 0;
};

export const adminIdentity = (
  facts: AdminRequestFacts
): Effect.Effect<AdminGrant | undefined> =>
  Effect.gen(function* readAdminIdentity() {
    const password = yield* AdminPassword;

    if (
      password !== "" &&
      sameText(facts.authorization, `Bearer ${password}`)
    ) {
      return { via: "bearer" };
    }

    const token = facts.accessJwt;

    if (token === undefined) {
      return;
    }

    const login = yield* AccessLogin;

    return (yield* login.verify(token)) ? { via: "access" } : undefined;
  });

export const adminFromRequest = {
  failure: Unauthorized,
  from: (request: AdminRequestSource) =>
    Effect.gen(function* grantAdmin() {
      const grant = yield* adminIdentity(adminFactsOf(request.headers));

      if (grant === undefined) {
        return yield* Effect.fail({ error: "Unauthorized" as const });
      }

      return grant;
    }),
  tag: Admin,
};
