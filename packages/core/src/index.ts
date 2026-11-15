export { joinInterest, JoinInterest } from "./join-interest.js";

export { AppConfig } from "./app-config.js";

export { ConfigService } from "./config-service.js";

export { FileInspector } from "./file-inspector.js";

export {
  ReadOutput,
  ResourceNotFound,
  SearchMatch,
  SearchOutput,
  inspectFileContract,
  readContract,
  searchContract,
} from "./contracts.js";

export { capabilities, inspectFile } from "./inspect-file.js";

export { PromptLibrary, getPrompt, listPrompts } from "./prompts.js";

export { CafeDataError } from "./cafe-data-error.js";

export { CafeDataInvalid } from "./cafe-data-invalid.js";

export {
  cafeNewsFile,
  cafePeopleFile,
  cafeProjectsFile,
  decodeCafeData,
  decodeCafeEntries,
  describeCafeDataError,
} from "./cafe-data.js";

export {
  CafeDirectory,
  listCafeNews,
  listCafeProjects,
  listChannels,
  listPeople,
  peopleCapabilities,
  peopleFor,
  readPerson,
  searchPeople,
} from "./cafe-directory.js";

export {
  inspectMachine,
  runInspectMachine,
  type InspectOutcome,
} from "./inspect-machine.js";

export {
  ConversationEmailSchema,
  ConversationEventsSchema,
  ConversationInputSchema,
  ConversationRefusalSchema,
  ConversationStateSchema,
  ConversationStatusSchema,
  HANDOFF_REPEAT_WINDOW_SECONDS,
  MissingProfileFieldSchema,
  VisitorAccountSchema,
  VisitorProfileSchema,
  conversationMachine,
  conversationStep,
  startConversation,
  stepConversation,
  type ConversationEvent,
  type ConversationInput,
  type ConversationRefusal,
  type ConversationSnapshot,
  type ConversationState,
  type ConversationStatus,
  type ConversationStep,
  type MissingProfileField,
  type VisitorAccount,
  type VisitorProfile,
} from "./conversation-machine.js";

export {
  FileStatsError,
  FileStatsSchema,
  formatFileStats,
  summarizeBytes,
  summarizeText,
  type FileStats,
} from "./stats.js";
