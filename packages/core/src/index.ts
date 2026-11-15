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

export { helpCategoryName } from "./help-category.js";

export { helpArticlePane } from "./help-article-pane.js";

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
} from "./help-article-html.js";

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
  FileStatsError,
  FileStatsSchema,
  formatFileStats,
  summarizeBytes,
  summarizeText,
  type FileStats,
} from "./stats.js";
