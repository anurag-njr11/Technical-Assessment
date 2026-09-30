/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ResendOTP from "../ResendOTP.js";
import type * as access from "../access.js";
import type * as answerKey from "../answerKey.js";
import type * as auth from "../auth.js";
import type * as buildScenario from "../buildScenario.js";
import type * as builds from "../builds.js";
import type * as candidates from "../candidates.js";
import type * as dashboard from "../dashboard.js";
import type * as evaluation from "../evaluation.js";
import type * as golden from "../golden.js";
import type * as grading from "../grading.js";
import type * as http from "../http.js";
import type * as insights from "../insights.js";
import type * as items from "../items.js";
import type * as judges from "../judges.js";
import type * as macaly from "../macaly.js";
import type * as metrics from "../metrics.js";
import type * as rateLimit from "../rateLimit.js";
import type * as reliability from "../reliability.js";
import type * as reviews from "../reviews.js";
import type * as scoring from "../scoring.js";
import type * as submissions from "../submissions.js";
import type * as tracing from "../tracing.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ResendOTP: typeof ResendOTP;
  access: typeof access;
  answerKey: typeof answerKey;
  auth: typeof auth;
  buildScenario: typeof buildScenario;
  builds: typeof builds;
  candidates: typeof candidates;
  dashboard: typeof dashboard;
  evaluation: typeof evaluation;
  golden: typeof golden;
  grading: typeof grading;
  http: typeof http;
  insights: typeof insights;
  items: typeof items;
  judges: typeof judges;
  macaly: typeof macaly;
  metrics: typeof metrics;
  rateLimit: typeof rateLimit;
  reliability: typeof reliability;
  reviews: typeof reviews;
  scoring: typeof scoring;
  submissions: typeof submissions;
  tracing: typeof tracing;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
