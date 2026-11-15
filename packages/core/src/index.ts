export { joinInterest, JoinInterest } from "./join-interest.js";

export { AppConfig } from "./app-config.js";

export { ConfigService } from "./config-service.js";

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

export {
  Admin,
  AccessLogin,
  AdminPassword,
  Unauthorized,
  adminFactsOf,
  adminFromRequest,
  adminIdentity,
  sameText,
} from "./admin-access.js";

export {
  AdminConversationStore,
  AdminConversationDetail,
  AdminConversationRow,
  AdminCustomerConversation,
  AdminInboxItem,
  AdminInboxRow,
  AdminMessageRow,
} from "./admin-conversation-store.js";

export {
  AdminClock,
  adminConversationCapabilities,
  acceptAdminConversation,
  archiveAdminConversation,
  archiveAdminConversations,
  archiveIdsOf,
  closeAdminConversation,
  inboxQueryOf,
  lastSeenOf,
  listAdminConversations,
  listCustomerConversations,
  readAdminConversation,
  readAdminUsage,
  replyToAdminConversation,
  takeoverAdminConversation,
  unarchiveAdminConversation,
  unreadOf,
} from "./admin-conversations.js";

export {
  AdminUsageReport,
  HAIKU_MODEL,
  HAIKU_PRICES_PER_MTOK,
  UsageDayReport,
  UsageDayRow,
  UsageTotals,
  buildUsageReport,
  nanosToUsd,
  usageCostNanos,
  usageSince,
  usageWindowDays,
} from "./admin-usage.js";

export {
  NoConversationIds,
  NoCustomerEmail,
  acceptAdminConversationContract,
  archiveAdminConversationContract,
  archiveAdminConversationsContract,
  closeAdminConversationContract,
  listAdminConversationsContract,
  listCustomerConversationsContract,
  readAdminConversationContract,
  readAdminUsageContract,
  replyToAdminConversationContract,
  takeoverAdminConversationContract,
  unarchiveAdminConversationContract,
} from "./admin-contracts.js";

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
