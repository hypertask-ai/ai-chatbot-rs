import { expect, it } from "@effect/vitest";

import { publishedWebsiteWorkerName } from "../../web/src/website-props.js";
import { helpRatstackRoute } from "../src/help-ratstack-route.js";

it("the planned help route names the test address, its zone and the Worker", () => {
  expect(helpRatstackRoute.active).toStrictEqual(false);
  expect(helpRatstackRoute.basePath).toStrictEqual("/ratstack");
  expect(helpRatstackRoute.pattern).toStrictEqual(
    `help.hypertask.ai${helpRatstackRoute.basePath}*`
  );
  expect(helpRatstackRoute.zoneName).toStrictEqual("hypertask.ai");
  expect(helpRatstackRoute.workerName).toStrictEqual(
    publishedWebsiteWorkerName
  );
});
