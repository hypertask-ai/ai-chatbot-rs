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

export {
  HANDOFF_EMAIL_REPLY,
  HANDOFF_EMAIL_USER_MESSAGE,
  HANDOFF_REPLY,
  chatHandoffEmailFor,
  leaveHandoffEmail,
  requestHandoff,
  type ChatHandoffEmailRequest,
} from "./chat-handoff.js";

export { saveVisitorProfile } from "./chat-profile.js";

export {
  ChatConversationSchema,
  ChatConversationSeedSchema,
  ChatConversationStore,
  ReturningCustomerSchema,
  conversationStateOf,
  memoryChatConversations,
  type ChatConversation,
  type ChatConversationOperations,
  type ChatConversationSeed,
  type ChatHandoffEmailChange,
  type ChatHandoffEmailOutcome,
  type ChatProfileChange,
  type ReturningCustomer,
} from "./chat-conversation-store.js";

export {
  ChatMessageRoleSchema,
  ChatMessageSchema,
  ChatMessageStore,
  memoryChatMessages,
  type ChatMessage,
  type ChatMessageOperations,
  type ChatMessageRole,
} from "./chat-message-store.js";

export {
  ChatVisitorAuth,
  VISITOR_SECRET_MAX_LENGTH,
  hashVisitorSecret,
  readBearerToken,
  type ChatVisitorAuthValue,
} from "./chat-visitor-auth.js";

export {
  CustomerAlerts,
  HandoffAlertSchema,
  type CustomerAlertOperations,
  type HandoffAlert,
} from "./customer-alerts.js";

export {
  HandoffEmail,
  HandoffEmailMessageSchema,
  type HandoffEmailMessage,
  type HandoffEmailOperations,
} from "./handoff-email.js";

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
