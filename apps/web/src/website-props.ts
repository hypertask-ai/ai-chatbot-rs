import { workerBindings } from "./server/site-bindings.js";

export const publishedWebsiteWorkerName = "ai-chatbot-rs";

export const websiteProps = (stage: string) =>
  stage.startsWith("pr-")
    ? { env: workerBindings, rootDir: "../web" }
    : {
        env: workerBindings,
        name: publishedWebsiteWorkerName,
        rootDir: "../web",
      };
