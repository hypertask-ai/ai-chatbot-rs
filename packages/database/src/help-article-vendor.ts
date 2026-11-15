import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Drizzle from "@alchemy.run/drizzle";
import * as RuntimeContext from "alchemy/RuntimeContext";
import { asc, eq, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";

import {
  helpArticleLayer,
  MATCH_CANDIDATE_LIMIT,
  queryFailure,
} from "./help-article.js";
import { Articles } from "./schema/d1.js";
import type { DatabaseVendorResource } from "./vendor.js";

const matchColumns = {
  category: Articles.category,
  excerpt: Articles.excerpt,
  id: Articles.id,
  slug: Articles.slug,
  title: Articles.title,
};

const listColumns = {
  category: Articles.category,
  created_at: Articles.createdAt,
  excerpt: Articles.excerpt,
  id: Articles.id,
  slug: Articles.slug,
  title: Articles.title,
};

const articleColumns = {
  category: Articles.category,
  content: Articles.content,
  created_at: Articles.createdAt,
  excerpt: Articles.excerpt,
  id: Articles.id,
  slug: Articles.slug,
  title: Articles.title,
  updated_at: Articles.updatedAt,
  url: Articles.url,
};

export const HelpArticleStoreLayer = (vendor: DatabaseVendorResource) =>
  Layer.unwrap(
    Match.value(vendor).pipe(
      Match.tags({
        D1: (d1) =>
          Effect.gen(function* buildD1HelpArticleStoreLayer() {
            const client = yield* Cloudflare.D1.QueryDatabase(d1.database);

            const db = yield* Drizzle.D1(client);

            return helpArticleLayer(
              Effect.succeed({
                contentMatches: (pattern) =>
                  db
                    .select(matchColumns)
                    .from(Articles)
                    .where(sql`LOWER(${Articles.content}) LIKE ${pattern}`)
                    .limit(MATCH_CANDIDATE_LIMIT)
                    .pipe(
                      Effect.mapError(queryFailure("searchHelpArticles")),
                      Effect.provide(RuntimeContext.RuntimeContext.phantom)
                    ),
                listRows: db
                  .select(listColumns)
                  .from(Articles)
                  .orderBy(asc(Articles.category), asc(Articles.title))
                  .pipe(
                    Effect.mapError(queryFailure("listHelpArticles")),
                    Effect.provide(RuntimeContext.RuntimeContext.phantom)
                  ),
                readRow: (slug) =>
                  db
                    .select(articleColumns)
                    .from(Articles)
                    .where(eq(Articles.slug, slug))
                    .limit(1)
                    .pipe(
                      Effect.mapError(queryFailure("readHelpArticle")),
                      Effect.provide(RuntimeContext.RuntimeContext.phantom)
                    ),
                titleMatches: (pattern) =>
                  db
                    .select(matchColumns)
                    .from(Articles)
                    .where(sql`LOWER(${Articles.title}) LIKE ${pattern}`)
                    .limit(MATCH_CANDIDATE_LIMIT)
                    .pipe(
                      Effect.mapError(queryFailure("searchHelpArticles")),
                      Effect.provide(RuntimeContext.RuntimeContext.phantom)
                    ),
              })
            );
          }),
        HyperdrivePostgres: () =>
          Effect.die(
            "Help articles have no Postgres adapter yet. Fix: provide the D1 vendor, or add the Postgres tables and adapter before choosing that vendor."
          ),
      }),
      Match.exhaustive
    )
  );
