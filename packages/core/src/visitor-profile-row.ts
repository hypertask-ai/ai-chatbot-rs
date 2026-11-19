import { Schema } from "effect";

import type { VisitorProfile } from "./conversation-machine.js";

export const VisitorProfileRowSchema = Schema.Struct({
  has_hypertask_account: Schema.String,
  visitor_email: Schema.NullOr(Schema.String),
  visitor_name: Schema.NullOr(Schema.String),
});

export type VisitorProfileRow = typeof VisitorProfileRowSchema.Type;

const filled = (value: string | null): string | undefined =>
  value === null || value === "" ? undefined : value;

const accountIn = (value: string): VisitorProfile["account"] => {
  if (value === "free" || value === "none" || value === "paid") {
    return value;
  }

  return "unknown";
};

export const visitorProfileFromRow = (
  row: VisitorProfileRow
): VisitorProfile => ({
  account: accountIn(row.has_hypertask_account),
  email: filled(row.visitor_email),
  name: filled(row.visitor_name),
});
