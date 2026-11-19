import { implement } from "@rat-stack/capability/implement";

import { adminConversationCapabilities } from "./admin-conversations.js";
import {
  listCafeNews,
  listCafeProjects,
  peopleCapabilities,
} from "./cafe-directory.js";
import { leaveHandoffEmail, requestHandoff } from "./chat-handoff.js";
import { saveVisitorProfile } from "./chat-profile.js";
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
  leaveHandoffEmail,
  listPrompts,
  getPrompt,
  listCafeNews,
  listCafeProjects,
  ...peopleCapabilities,
  ...helpArticleCapabilities,
  ...helpRetrievalCapabilities,
  requestHandoff,
  saveVisitorProfile,
  ...adminConversationCapabilities,
] as const;
