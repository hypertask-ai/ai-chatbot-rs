import { Context, Effect, Option, Schema } from "effect";

export const Unauthorized = Schema.Struct({
  error: Schema.Literal("Unauthorized"),
}).annotate({ httpApiStatus: 401 });

export type UnauthorizedValue = typeof Unauthorized.Type;

export interface AdminRequestFacts {
  readonly accessJwt: string | undefined;
  readonly authorization: string | undefined;
}

export type AdminHeaderSource = Readonly<Record<string, string | undefined>>;

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

export class Admin extends Context.Service<Admin, AdminGrant>()(
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
): Effect.Effect<Option.Option<AdminGrant>> =>
  Effect.gen(function* readAdminIdentity() {
    const password = yield* AdminPassword;
    const token = facts.accessJwt;
    const login = yield* AccessLogin;
    const bearer: AdminGrant = { via: "bearer" };
    const access: AdminGrant = { via: "access" };

    if (
      password !== "" &&
      sameText(facts.authorization, `Bearer ${password}`)
    ) {
      return Option.some(bearer);
    }

    if (token === undefined) {
      return Option.none();
    }

    return (yield* login.verify(token)) ? Option.some(access) : Option.none();
  });

export const adminFromRequest = {
  failure: Unauthorized,
  from: (request: AdminRequestSource) =>
    Effect.gen(function* grantAdmin() {
      const grant = yield* adminIdentity(adminFactsOf(request.headers));

      if (Option.isNone(grant)) {
        return yield* Effect.fail({ error: "Unauthorized" as const });
      }

      return grant.value;
    }),
  tag: Admin,
};
