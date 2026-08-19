import { RateLimiter } from "../helpers/RateLimiter.js";
import { getEnv } from "../config/env.js";

// Single RateLimiter instance for every MCP call to the data.geopf.fr/navigation
// service, so that all of them draw on one GPF_NAVIGATION_RATE_LIMIT budget.
let sharedNavigationRateLimiter: RateLimiter | undefined;

export function getNavigationRateLimiter(): RateLimiter {
  sharedNavigationRateLimiter ??= new RateLimiter({
    name: "GPF_NAVIGATION",
    maxCalls: getEnv().GPF_NAVIGATION_RATE_LIMIT,
    period: 1,
  });
  return sharedNavigationRateLimiter;
}
