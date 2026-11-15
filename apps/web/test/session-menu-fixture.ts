export const sessionMenuNow = 1_795_000_000_000;

const fifty = "x".repeat(50);

export const sessionMenuFixture = {
  copy: {
    menuEmptyBody: "Start a new conversation to get help",
    menuEmptyHeading: "No conversations yet",
    menuTitle: "Conversations",
    newConversationLabel: "New conversation",
    newConversationText: "New",
    pastChatEmpty: "No messages in this conversation.",
    pastChatTitle: "Past Conversation",
    readOnlyBanner: "Viewing past conversation (read-only)",
    sessionInvalidTime: "Invalid Date",
    sessionJustNow: "Just now",
    sessionNoMessages: "No messages yet",
    sessionYesterday: "Yesterday",
  },
  previews: [
    { expected: "No messages yet", lastMessage: null },
    { expected: "No messages yet", lastMessage: "" },
    { expected: "No messages yet", lastMessage: undefined },
    { expected: fifty, lastMessage: fifty },
    { expected: `${fifty}...`, lastMessage: `${fifty}y` },
  ],
  times: [
    { expected: "Just now", millisAgo: 30_000 },
    { expected: "Just now", millisAgo: 59_000 },
    { expected: "1 min ago", millisAgo: 60_000 },
    { expected: "5 min ago", millisAgo: 300_000 },
    { expected: "59 min ago", millisAgo: 3_540_000 },
    { expected: "1 hour ago", millisAgo: 3_600_000 },
    { expected: "3 hours ago", millisAgo: 10_800_000 },
    { expected: "23 hours ago", millisAgo: 82_800_000 },
    { expected: "Yesterday", millisAgo: 86_400_000 },
    { expected: "2 days ago", millisAgo: 172_800_000 },
    { expected: "6 days ago", millisAgo: 518_400_000 },
  ],
} as const;

export const oldSecondsStamp = 1_760_000_000;

export const oldSecondsStampLabel = "Jan 21";
