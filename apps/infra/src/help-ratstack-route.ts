import { publishedWebsiteWorkerName } from "../../web/src/website-props.js";

export interface PlannedWorkerRoute {
  readonly active: false;
  readonly basePath: string;
  readonly pattern: string;
  readonly workerName: string;
  readonly zoneName: string;
}

export const helpRatstackRoute: PlannedWorkerRoute = {
  active: false,
  basePath: "/ratstack",
  pattern: "help.hypertask.ai/ratstack*",
  workerName: publishedWebsiteWorkerName,
  zoneName: "hypertask.ai",
};
