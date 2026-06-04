/**
 * Injectable WFS HTTP transport with rate limiting.
 *
 * Encapsulates the low-level fetch + rate-limit concern so that
 * consumers can swap the transport (e.g. different rate limit per service,
 * or a test double).
 */

import type { CompiledRequest } from "./request.js";
import type { WfsFeatureCollectionResponse } from "./types.js";
import { fetchJSONPost } from "../helpers/http.js";
import { RateLimiter } from "../helpers/RateLimiter.js";

export class WfsTransport {
  constructor(private rateLimiter: RateLimiter) {}

  /**
   * Executes a compiled WFS request: enforces rate limiting, builds the
   * full URL from query params, and POSTs the body.
   */
  async post(request: CompiledRequest): Promise<WfsFeatureCollectionResponse> {
    await this.rateLimiter.limit();

    const url = `${request.url}?${new URLSearchParams(request.query).toString()}`;
    return fetchJSONPost(url, request.body, {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    }) as Promise<WfsFeatureCollectionResponse>;
  }
}
