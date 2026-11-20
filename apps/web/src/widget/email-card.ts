export const emailCardCopy = {
  failed: "Could not send. Please try again.",
  invalid: "Enter a valid email address.",
  label: "Your email",
  saved: "Saved. The team will see this chat.",
  submit: "Send to the team",
} as const;

export const emailSentMessage = (email: string, emailed: boolean): string =>
  emailed
    ? `Sent. The team replies to ${email} within one working day.`
    : emailCardCopy.saved;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export const emailProblem = (email: string): string | null =>
  emailPattern.test(email.trim()) ? null : emailCardCopy.invalid;
