export { joinInterest, JoinInterest } from "./join-interest.js";

export { AppConfig } from "./app-config.js";

export {
  ConfigService,
  type ConfigValues,
  type ServiceClass,
} from "./config-service.js";

export { FileInspector } from "./file-inspector.js";

export {
  HelpArticle,
  HelpArticleMatch,
  HelpArticleNotFound,
  HelpArticlePane,
  HelpArticleSummary,
  HelpArticleTimestamp,
  ReadOutput,
  ResourceNotFound,
  SearchMatch,
  SearchOutput,
  inspectFileContract,
  listHelpArticlesContract,
  readContract,
  readHelpArticleContract,
  readHelpArticlePaneContract,
  searchContract,
  searchHelpArticlesContract,
} from "./contracts.js";

export {
  HelpArticleStore,
  type HelpArticleMatchValue,
  type HelpArticleMemory,
  type HelpArticleSearch,
  type HelpArticleSummaryValue,
  type HelpArticleValue,
} from "./help-article-store.js";

export {
  expandedHelpQueryTerms,
  helpArticleStem,
  helpArticleTokens,
  rankHelpArticles,
  scoreHelpSearchMatches,
  HelpRetrievalAnswer,
  HelpRetrievalArticle,
  HelpSearchArticle,
  type HelpRetrievalAnswerValue,
  type HelpSearchArticleValue,
} from "./help-search.js";

export {
  DEBUG_RETRIEVAL_DEFAULT_QUERY,
  HelpArticleCorpus,
  debugHelpRetrieval,
  findHelpArticles,
  helpRetrievalCapabilities,
} from "./help-retrieval.js";

export {
  helpArticleCapabilities,
  helpSearchKeywords,
  listHelpArticles,
  readHelpArticle,
  readHelpArticlePane,
  searchHelpArticles,
} from "./help-articles.js";

export {
  FREE_BOARD_CAP,
  PAID_SEAT_CAP,
  PRICING_ARTICLE_SLUG,
  SALES_EMAIL,
  SIGNUP_URL,
  TRIAL_DAYS,
  YEARLY_SAVE_PERCENT,
  helpPlans,
  helpPlansHtml,
  helpSeatRate,
  type HelpPlan,
  type HelpPlanId,
  type HelpSeatRate,
} from "./help-plans.js";

export {
  formatHelpArticleContent,
  isHtmlHelpArticle,
  plainTextOf,
} from "./help-article-html.js";

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

export { ChatClock, type ChatClockValue } from "./chat-clock.js";

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
  NewConversationAlertSchema,
  NewMessageAlertSchema,
  raiseCustomerAlert,
  type CustomerAlert,
  type CustomerAlertOperations,
  type HandoffAlert,
  type NewConversationAlert,
  type NewMessageAlert,
} from "./customer-alerts.js";

export {
  CUSTOMER_ALERT_CHAT_URL,
  CUSTOMER_ALERT_PREVIEW_LENGTH,
  CUSTOMER_ALERT_UNKNOWN_VISITOR,
  customerAlertChatUrl,
  customerAlertMessagePreview,
  customerAlertText,
  customerAlertVisitorLabel,
  escapeCustomerAlertHtml,
} from "./customer-alert-text.js";

export {
  EVAL_HEADER,
  EXCLUDE_EVAL_SQL,
  isEvalConversation,
  isVerifiedEvalRequest,
} from "./eval-traffic.js";

export {
  HandoffEmail,
  HandoffEmailMessageSchema,
  type HandoffEmailMessage,
  type HandoffEmailOperations,
} from "./handoff-email.js";

export { shouldOfferHandoff, type HandoffOfferInput } from "./handoff-offer.js";

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

export {
  answerMachine,
  answerOutcome,
  runAnswer,
  type AnswerOutcome,
} from "./answer-machine.js";

export {
  addTokenUsage,
  ANSWER_FAILURE_MESSAGE,
  AnswerContentSchema,
  AnswerImageBlockSchema,
  AnswerMessageSchema,
  AnswerModel,
  AnswerRequestSchema,
  AnswerTextBlockSchema,
  EMPTY_ANSWER_MESSAGE,
  emptyUsage,
  fallbackAnswer,
  HAIKU_BUSY_MESSAGE,
  HAIKU_MODEL,
  HAIKU_RETRY,
  HAIKU_RETRY_LIMIT,
  HAIKU_RETRY_WAIT,
  answerModelFailure,
  settleAnswer,
  TokenUsageSchema,
  TRUNCATED_ANSWER_CLOSE,
  type AnswerImageBlock,
  type AnswerMessage,
  type AnswerModelFailure,
  type AnswerRequest,
  type AnswerStreamRead,
  type AnswerTextBlock,
  type SettledAnswer,
  type TokenUsage,
} from "./answer-model.js";
