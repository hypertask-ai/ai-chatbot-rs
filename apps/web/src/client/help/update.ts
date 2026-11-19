import type { Update } from "foldkit";

import { Message } from "./message.js";
import type { AppMessage } from "./message.js";
import type { AppModel } from "./model.js";

type UpdateReturn = Update.Return<AppModel, AppMessage>;

export const update = (model: AppModel, message: AppMessage): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    ArticleFeedbackGiven: ({ sentiment }) => {
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
    },
  });
