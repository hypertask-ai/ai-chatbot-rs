import type { Update } from "foldkit";

import { LoadHelpArticle } from "./command.js";
import { Message } from "./message.js";
import type { AppMessage } from "./message.js";
import type { AppModel } from "./model.js";
import { readerStep } from "./reader.js";

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

export const update = (model: AppModel, message: AppMessage): UpdateReturn =>
  Message.matchOrElse<UpdateReturn>(
    message,
    {
      ArticleFeedbackGiven: ({ sentiment }) => feedbackGiven(model, sentiment),
    },
    (readerEvent) => {
      const step = readerStep(model.reader, readerEvent);

      return {
        commands: step.commands.map((command) =>
          LoadHelpArticle({ slug: command.slug })
        ),
        model: { ...model, reader: step.phase },
      };
    }
  );
