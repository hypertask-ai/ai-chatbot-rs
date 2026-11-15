export const EVAL_HEADER = "x-eval-token";

export const EXCLUDE_EVAL_SQL = "COALESCE(c.is_eval, 0) = 0";

export const isEvalConversation = (flag: unknown): boolean =>
  flag === 1 || flag === true || flag === "1";

export const isVerifiedEvalRequest = (
  header: string | undefined,
  secret: string | undefined
): boolean => {
  if (
    header === undefined ||
    secret === undefined ||
    header === "" ||
    secret === ""
  ) {
    return false;
  }

  const provided = new TextEncoder().encode(header);
  const expected = new TextEncoder().encode(secret);
  const length = Math.max(provided.length, expected.length);
  let difference = provided.length === expected.length ? 0 : 1;

  for (let index = 0; index < length; index += 1) {
    difference += (provided[index] ?? 0) === (expected[index] ?? 0) ? 0 : 1;
  }

  return difference === 0;
};
