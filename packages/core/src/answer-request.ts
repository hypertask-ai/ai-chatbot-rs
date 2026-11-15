import { Predicate } from "effect";

import { HAIKU_MODEL } from "./answer-model.js";
import type {
  AnswerImageBlock,
  AnswerMessage,
  AnswerRequest,
  AnswerTextBlock,
} from "./answer-model.js";
import { PERSON_FOLLOWUP, SYSTEM_PROMPT } from "./answer-prompt.js";

export const MAX_OUTPUT_TOKENS = 800;

export const HISTORY_TURN_LIMIT = 8;

export interface ChatTurn {
  readonly content: string;
  readonly role: "assistant" | "user";
}

export interface VisitorProfile {
  readonly has_hypertask_account: string;
  readonly visitor_email: string | null;
  readonly visitor_name: string | null;
}

export interface AnswerPageContext {
  readonly title: string;
  readonly url: string;
}

export type AnswerUserContent = AnswerMessage["content"];

export interface AnswerRequestInput {
  readonly articleContext: string;
  readonly history: readonly ChatTurn[];
  readonly page?: AnswerPageContext | null;
  readonly profile?: VisitorProfile | null;
  readonly userContent: AnswerUserContent;
}

const DATA_IMAGE_URL =
  /^data:(?<mediaType>image\/[a-zA-Z0-9.+-]+);base64,(?<data>[A-Za-z0-9+/=\s]+)$/u;

const textBlock = (text: string): AnswerTextBlock =>
  // oxlint-disable-next-line sort-keys -- The old request sends type before text and the recorded body compares the encoded JSON.
  ({ type: "text", text });

const cachedTextBlock = (text: string): AnswerTextBlock =>
  // oxlint-disable-next-line sort-keys -- The old request sends type, text, then cache_control and the recorded body compares the encoded JSON.
  ({ type: "text", text, cache_control: { type: "ephemeral" } });

export const textFromUserContent = (content: AnswerUserContent): string =>
  Predicate.isString(content)
    ? content
    : content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("\n");

export const visitorAsksForPerson = (text: string): boolean => {
  const value = text.toLowerCase().replaceAll("’", "'");

  if (/\bhumans?\b/u.test(value)) {
    return true;
  }

  if (
    /\b(?:talk|speak|chat|connect|transfer)\b[\s\S]{0,40}\b(?:person|someone)\b/u.test(
      value
    )
  ) {
    return true;
  }

  if (/\b(?:real|live)\s+person\b/u.test(value)) {
    return true;
  }

  if (
    /\b(?:customer support|live support|live agent|support agent)\b/u.test(
      value
    )
  ) {
    return true;
  }

  if (
    /\b(?:need|want|get)\b[\s\S]{0,30}\b(?:support|an agent|a person)\b/u.test(
      value
    )
  ) {
    return true;
  }

  return (
    /\b(?:talk|speak|chat|connect|transfer)\b[\s\S]{0,40}\bagent\b/u.test(
      value
    ) && !/\bcoding agents?\b/u.test(value)
  );
};

const imageBlockOf = (mediaType: string, data: string): AnswerImageBlock =>
  // oxlint-disable-next-line sort-keys -- The old request sends type before source and the recorded body compares the encoded JSON.
  ({
    type: "image",
    // oxlint-disable-next-line sort-keys -- The old request sends type, media_type, then data and the recorded body compares the encoded JSON.
    source: { type: "base64", media_type: mediaType, data },
  });

const emptyFallback = (imageUrl?: string): string =>
  imageUrl === undefined ? "Hello" : "What is this image?";

const fallbackText = (trimmed: string, imageUrl?: string): string =>
  trimmed === "" ? emptyFallback(imageUrl) : trimmed;

export const toAnswerUserContent = (
  text: string,
  imageUrl?: string
): AnswerUserContent => {
  const fallback = fallbackText(text.trim(), imageUrl);

  if (imageUrl === undefined) {
    return fallback;
  }

  const image = DATA_IMAGE_URL.exec(imageUrl);
  const mediaType = image?.groups?.mediaType;
  const imageData = image?.groups?.data;

  const data =
    imageData === undefined ? undefined : imageData.replaceAll(/\s/gu, "");

  if (mediaType === undefined || data === undefined) {
    return fallback;
  }

  return [textBlock(fallback), imageBlockOf(mediaType, data)];
};

const accountOf = (profile: VisitorProfile): string | null => {
  const account = profile.has_hypertask_account;

  if (account === "" || account === "unknown") {
    return null;
  }

  return account;
};

export const profileContextBlock = (
  profile?: VisitorProfile | null
): string | null => {
  if (profile === undefined || profile === null) {
    return null;
  }

  const name = profile.visitor_name === "" ? null : profile.visitor_name;
  const email = profile.visitor_email === "" ? null : profile.visitor_email;
  const account = accountOf(profile);

  if (name === null && email === null && account === null) {
    return null;
  }

  const displayName = name ?? "Unknown";
  const address = email === null ? "" : ` <${email}>`;
  const plan = account === null ? "" : ` (${account} account)`;

  return `Visitor: ${displayName}${address}${plan}`;
};

export const pageContextBlock = (
  page?: AnswerPageContext | null
): string | null => {
  if (page === undefined || page === null || page.url === "") {
    return null;
  }

  const title = page.title === "" ? "Untitled" : page.title;

  return `The visitor is reading this page right now:\nTitle: ${title}\nURL: ${page.url}\nUse this when it helps the answer. Do not invent other pages.`;
};

export const trimConversation = (
  history: readonly ChatTurn[],
  limit = HISTORY_TURN_LIMIT
): ChatTurn[] => {
  const cleaned = history.filter((turn) => turn.content.trim().length > 0);
  const sliced = cleaned.slice(-limit);
  const turns = sliced[0]?.role === "assistant" ? sliced.slice(1) : sliced;
  const merged: ChatTurn[] = [];

  for (const turn of turns) {
    const previous = merged.at(-1);

    if (previous !== undefined && previous.role === turn.role) {
      merged[merged.length - 1] = {
        content: `${previous.content}\n${turn.content}`,
        role: turn.role,
      };
    } else {
      merged.push({ content: turn.content, role: turn.role });
    }
  }

  return merged;
};

const userMessage = (content: AnswerUserContent): AnswerMessage =>
  // oxlint-disable-next-line sort-keys -- The old request sends role before content and the recorded body compares the encoded JSON.
  ({ role: "user", content });

export const buildAnswerRequest = (
  input: AnswerRequestInput
): AnswerRequest => {
  const userText = textFromUserContent(input.userContent);

  const system: AnswerTextBlock[] = [
    cachedTextBlock(SYSTEM_PROMPT),
    textBlock(input.articleContext),
  ];

  const profileText = profileContextBlock(input.profile);

  if (profileText !== null) {
    system.push(textBlock(profileText));
  }

  const pageText = pageContextBlock(input.page);

  if (pageText !== null) {
    system.push(textBlock(pageText));
  }

  if (visitorAsksForPerson(userText)) {
    system.push(textBlock(PERSON_FOLLOWUP));
  }

  // oxlint-disable-next-line sort-keys -- The old request body sends these keys in this order and the recorded body compares the encoded JSON.
  return {
    model: HAIKU_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    stream: true,
    thinking: { type: "disabled" },
    system,
    messages: [
      ...trimConversation(input.history),
      userMessage(input.userContent),
    ],
  };
};
