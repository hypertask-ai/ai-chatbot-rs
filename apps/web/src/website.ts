import * as Cloudflare from "@alchemy.run/cloudflare";
import { Stage } from "alchemy/Stage";
import * as Effect from "effect/Effect";

import { websiteProps } from "./website-props.js";

export class Website extends Cloudflare.Website.Foldkit<Website>()(
  "Website",
  Effect.gen(function* websiteStage() {
    const stage = yield* Stage;

    return websiteProps(stage);
  })
) {}
