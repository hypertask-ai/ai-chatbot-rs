import { implement } from "@rat-stack/capability/implement";

import {
  listCafeNews,
  listCafeProjects,
  peopleCapabilities,
} from "./cafe-directory.js";
import { inspectFileContract } from "./contracts.js";
import { flagCapabilities } from "./flag-capabilities.js";
import { health } from "./health.js";
import { helpArticleCapabilities } from "./help-articles.js";
import { helpRetrievalCapabilities } from "./help-retrieval.js";
import { runInspectMachine } from "./inspect-machine.js";
import { joinInterest } from "./join-interest.js";
import { getPrompt, listPrompts } from "./prompts.js";

export const inspectFile = implement(inspectFileContract, ({ path }) =>
  runInspectMachine(path)
);

export const capabilities = [
  inspectFile,
  health,
  ...flagCapabilities,
  joinInterest,
  listPrompts,
  getPrompt,
  listCafeNews,
  listCafeProjects,
  ...peopleCapabilities,
  ...helpArticleCapabilities,
  ...helpRetrievalCapabilities,
] as const;
