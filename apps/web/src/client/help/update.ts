import type { Update } from "foldkit";

import { LoadHelpArticle } from "./command.js";
import { Message } from "./message.js";
import type { AppMessage } from "./message.js";
import type { AppModel } from "./model.js";
import { readerStep } from "./reader.js";
import type { ReaderEventValue } from "./reader.js";

type UpdateReturn = Update.Return<AppModel, AppMessage>;

const feedbackGiven = (
  model: AppModel,
  sentiment: "no" | "yes"
): UpdateReturn => {
  const isNo = sentiment === "no";

  return {
    model: {
      ...model,
      feedback: {
        no: model.feedback.no || isNo,
        yes: model.feedback.yes || !isNo,
      },
    },
  };
};

const readerChanged = (
  model: AppModel,
  readerEvent: ReaderEventValue
): UpdateReturn => {
  const step = readerStep(model.reader, readerEvent);
  const next = { ...model, reader: step.phase };
  const reads = step.reads;

  return reads === undefined
    ? { model: next }
    : { commands: reads.map((slug) => LoadHelpArticle({ slug })), model: next };
};

export const update = (model: AppModel, message: AppMessage): UpdateReturn =>
  Message.matchOrElse(
    message,
    {
      ArticleFeedbackGiven: ({ sentiment }) => feedbackGiven(model, sentiment),
    },
    (readerEvent) => readerChanged(model, readerEvent)
  );
