import { implement } from "@rat-stack/capability/implement";
import { Effect, Schema } from "effect";

import { ChatClock } from "./chat-clock.js";
import {
  conversationNotFoundFailure,
  profileAccountInvalidFailure,
  profileConversationIdRequiredFailure,
  profileFieldsMissingFailure,
  saveVisitorProfileContract,
} from "./chat-contracts.js";
import type { VisitorProfileAnswer } from "./chat-contracts.js";
import {
  ChatConversationStore,
  conversationStateOf,
} from "./chat-conversation-store.js";
import type { ReturningCustomer } from "./chat-conversation-store.js";
import {
  VisitorAccountSchema,
  stepConversation,
} from "./conversation-machine.js";
import type { VisitorAccount, VisitorProfile } from "./conversation-machine.js";

const isVisitorAccount = Schema.is(VisitorAccountSchema);

interface ReturningLinks {
  readonly account: VisitorAccount | undefined;
  readonly name: string | undefined;
}

const normalizeProfileEmail = (email: string | undefined): string | undefined =>
  email === undefined ? undefined : email.trim().toLowerCase();

const visitorAccountOf = (
  hasAccount: string | undefined
): VisitorAccount | undefined =>
  hasAccount !== undefined && isVisitorAccount(hasAccount)
    ? hasAccount
    : undefined;

const hasText = (value: string | undefined): boolean =>
  value !== undefined && value !== "";

const returningLinksOf = (
  found: ReturningCustomer | undefined,
  nameGiven: boolean,
  accountGiven: boolean
): ReturningLinks => {
  if (found === undefined || !hasText(found.name)) {
    return { account: undefined, name: undefined };
  }

  return {
    account:
      accountGiven || found.hasAccount === "unknown"
        ? undefined
        : found.hasAccount,
    name: nameGiven ? undefined : found.name,
  };
};

const profileCompletedIn = (profile: VisitorProfile): boolean =>
  hasText(profile.name) && hasText(profile.email);

const autoPopulatedIn = (
  links: ReturningLinks
): VisitorProfileAnswer["autoPopulated"] => {
  if (links.name !== undefined && links.account !== undefined) {
    return { account: links.account, name: links.name };
  }

  if (links.name !== undefined) {
    return { name: links.name };
  }

  if (links.account !== undefined) {
    return { account: links.account };
  }

  return {};
};

const answerIn = (
  profile: VisitorProfile,
  links: ReturningLinks,
  profileCompleted: boolean
): VisitorProfileAnswer => ({
  autoPopulated: autoPopulatedIn(links),
  profile: {
    email: profile.email ?? null,
    hasAccount: profile.account,
    name: profile.name ?? null,
    profileCompleted,
  },
  returningCustomer: links.name !== undefined || links.account !== undefined,
  success: true,
});

export const saveVisitorProfile = implement(
  saveVisitorProfileContract,
  (input) =>
    Effect.gen(function* saveVisitorProfileEffect() {
      const conversations = yield* ChatConversationStore;
      const { conversationId } = input;

      if (conversationId === undefined || conversationId === "") {
        return yield* Effect.fail(profileConversationIdRequiredFailure);
      }

      const email = normalizeProfileEmail(input.email);

      const found =
        email === undefined
          ? undefined
          : yield* conversations.findReturningCustomer({
              email,
              excludeId: conversationId,
            });

      const links = returningLinksOf(
        found,
        input.name !== undefined,
        input.hasAccount !== undefined
      );

      const account = visitorAccountOf(input.hasAccount);

      if (input.hasAccount !== undefined && account === undefined) {
        return yield* Effect.fail(profileAccountInvalidFailure);
      }

      if (
        input.name === undefined &&
        input.email === undefined &&
        input.hasAccount === undefined
      ) {
        return yield* Effect.fail(profileFieldsMissingFailure);
      }

      const conversation = yield* conversations.read(conversationId);

      if (conversation === undefined) {
        return yield* Effect.fail(conversationNotFoundFailure);
      }

      const clock = yield* ChatClock;
      const at = yield* clock.now;

      const stepped = stepConversation(conversationStateOf(conversation), {
        account: account ?? links.account ?? conversation.hasAccount,
        at,
        email: email ?? conversation.email,
        name: input.name ?? links.name ?? conversation.name,
        type: "PROFILE_SAVED",
      });

      const { profile } = stepped.state;
      const profileCompleted = profileCompletedIn(profile);

      yield* conversations.saveProfile({
        at: stepped.state.updatedAt,
        email,
        hasAccount: account ?? links.account,
        id: conversationId,
        markProfileCompleted: profileCompleted,
        name: input.name === undefined ? links.name : profile.name,
      });

      const answer = answerIn(profile, links, profileCompleted);

      return answer;
    })
);
