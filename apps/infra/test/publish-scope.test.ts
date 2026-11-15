import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { AuthProviders, Stage } from "alchemy";
import { AlchemyContextLive } from "alchemy/AlchemyContext";
import { Effect, Layer } from "effect";
import * as HttpClient from "effect/http/HttpClient";

import stack from "../alchemy.run.js";

const services = Layer.mergeAll(
  AlchemyContextLive.pipe(Layer.provideMerge(NodeServices.layer)),
  Layer.succeed(Stage, "prod"),
  Layer.succeed(AuthProviders, {}),
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make(() => Effect.die("publish-scope-must-not-call-cloud-api"))
  )
);

it.effect("the publish stack declares one Worker and nothing else", () =>
  Effect.gen(function* checkPublishScope() {
    const compiled = yield* stack.pipe(Effect.provide(services));

    expect(Object.keys(compiled.resources)).toStrictEqual(["Website"]);
    expect(compiled.resources.Website?.Type).toBe("Cloudflare.Worker");
    expect(Object.keys(compiled.actions)).toStrictEqual([]);
  })
);
