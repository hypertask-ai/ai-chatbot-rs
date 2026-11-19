export type HandoffOfferInput = Readonly<{
  aiAnswer?: string;
  previousUserMessages?: readonly string[];
  priorBotAnswers?: number;
  userMessage?: string;
}>;

const stopWords = new Set([
  "about",
  "could",
  "does",
  "from",
  "have",
  "help",
  "hypertask",
  "into",
  "just",
  "like",
  "much",
  "need",
  "please",
  "some",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "this",
  "want",
  "what",
  "when",
  "where",
  "with",
  "would",
  "your",
]);

const words = (text: string): readonly string[] =>
  text
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s]/gu, " ")
    .split(/\s+/u)
    .filter((word) => word.length >= 4 && !stopWords.has(word));

const rephrases = (message: string, earlier: readonly string[]): boolean => {
  const current = new Set(words(message));

  if (current.size < 2) {
    return false;
  }

  return earlier.some((previous) => {
    const other = new Set(words(previous));

    if (other.size < 2) {
      return false;
    }

    let shared = 0;

    for (const word of other) {
      if (current.has(word)) {
        shared += 1;
      }
    }

    return shared / Math.min(current.size, other.size) >= 0.6;
  });
};

const thumbsDown = (message: string): boolean =>
  message.includes("👎") || /\bthumbs[-\s]?down\b/iu.test(message);

const answerMisses = (answer: string): boolean => {
  const text = answer.toLowerCase().replaceAll("’", "'");

  return (
    text.includes("i don't know") ||
    text.includes("i do not know") ||
    text.includes("i'm not sure") ||
    text.includes("i am not sure") ||
    text.includes("no matching article") ||
    text.includes("no relevant article") ||
    text.includes("no article matches") ||
    text.includes("no article covers") ||
    ((text.includes("couldn't find") || text.includes("could not find")) &&
      text.includes("article")) ||
    ((text.includes("don't have") || text.includes("do not have")) &&
      text.includes("article"))
  );
};

const humanWord = /\b(?<human>humans?)\b/u;

const personAsk =
  /\b(?<verb>talk|speak|chat|connect|transfer)\b[\s\S]{0,40}\b(?<who>person|someone)\b/u;

const realPerson = /\b(?<kind>real|live)\s+person\b/u;

const supportNoun =
  /\b(?<noun>customer support|live support|live agent|support agent)\b/u;

const supportAsk =
  /\b(?<verb>talk|speak|chat|connect|contact|reach|transfer|escalate)\b[\s\S]{0,40}\bsupport\b/u;

const supportNeed =
  /\b(?<verb>need|want|get)\b[\s\S]{0,30}\b(?<noun>support|an agent|a person)\b/u;

const agentAsk =
  /\b(?<verb>talk|speak|chat|connect|transfer)\b[\s\S]{0,40}\bagent\b/u;

const codingAgent = /\bcoding agents?\b/u;

const asksForHuman = (message: string): boolean => {
  const text = message.toLowerCase();

  const asks =
    humanWord.test(text) ||
    personAsk.test(text) ||
    realPerson.test(text) ||
    supportNoun.test(text) ||
    supportAsk.test(text) ||
    supportNeed.test(text);

  if (asks) {
    return true;
  }

  return agentAsk.test(text) && !codingAgent.test(text);
};

export const shouldOfferHandoff = (input: HandoffOfferInput): boolean => {
  const userMessage = input.userMessage ?? "";
  const aiAnswer = input.aiAnswer ?? "";
  const priorBotAnswers = input.priorBotAnswers ?? 0;
  const previous = input.previousUserMessages ?? [];

  if (asksForHuman(userMessage)) {
    return true;
  }

  if (answerMisses(aiAnswer)) {
    return true;
  }

  return (
    priorBotAnswers >= 2 &&
    (thumbsDown(userMessage) || rephrases(userMessage, previous))
  );
};
