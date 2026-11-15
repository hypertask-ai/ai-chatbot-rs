export const answerActionsCopy = {
  handoffIntro:
    "Sure. A person from our team replies by email within one working day. They see this chat, so you don't need to repeat yourself.",
  person: "Talk to a person",
  question: "Did that answer it?",
  thanks: "Thanks! Glad I could help.",
  yes: "Yes, thanks",
} as const;

export type AnswerRowPlacement = number | null;

export const answerRowHidden: AnswerRowPlacement = null;

export const answerRowAfter = (messageCount: number): AnswerRowPlacement =>
  messageCount > 0 ? messageCount - 1 : null;

export const answerRowShownAt = (
  placement: AnswerRowPlacement,
  index: number
): boolean => placement === index;

export const answerRowVisible = (
  placement: AnswerRowPlacement,
  messageCount: number
): boolean => placement !== null && placement >= 0 && placement < messageCount;
