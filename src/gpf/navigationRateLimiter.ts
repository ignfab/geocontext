import { RateLimiter } from "../helpers/RateLimiter.js";
import { getEnv } from "../config/env.js";

// Isochrone (navigation.ts) and itinerary (itinerary.ts) calls both hit the
// data.geopf.fr/navigation service and share the same GPF_NAVIGATION_RATE_LIMIT
// budget, so they share one RateLimiter instance.
let sharedNavigationRateLimiter: RateLimiter | undefined;

export function getNavigationRateLimiter(): RateLimiter {
  sharedNavigationRateLimiter ??= new RateLimiter({
    name: "GPF_NAVIGATION",
    maxCalls: getEnv().GPF_NAVIGATION_RATE_LIMIT,
    period: 1,
  });
  return sharedNavigationRateLimiter;
}
