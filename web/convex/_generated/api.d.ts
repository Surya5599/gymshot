/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as checkins from "../checkins.js";
import type * as crons from "../crons.js";
import type * as feed from "../feed.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_announce from "../lib/announce.js";
import type * as lib_days from "../lib/days.js";
import type * as lib_photoUrl from "../lib/photoUrl.js";
import type * as notifications from "../notifications.js";
import type * as pods from "../pods.js";
import type * as push from "../push.js";
import type * as pushNode from "../pushNode.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  billing: typeof billing;
  checkins: typeof checkins;
  crons: typeof crons;
  feed: typeof feed;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/announce": typeof lib_announce;
  "lib/days": typeof lib_days;
  "lib/photoUrl": typeof lib_photoUrl;
  notifications: typeof notifications;
  pods: typeof pods;
  push: typeof push;
  pushNode: typeof pushNode;
  users: typeof users;
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
