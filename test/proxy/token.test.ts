import { describe, expect, it } from "vitest";
import { createCipheriv, randomBytes } from "node:crypto";
import { brotliCompressSync } from "node:zlib";

import {
  decodeToken,
  encodeToken,
  MAX_PLAINTEXT_BYTES,
  MAX_TOKEN_CHARS,
  ProxyTokenMalformedError,
  ProxyTokenTamperedError,
  ProxyTokenTooLargeError,
} from "../../src/proxy/token";

const KEY = Buffer.alloc(32, 7);
const OTHER_KEY = Buffer.alloc(32, 9);

// Representative params, including each of the five spatial filter shapes.
const PARAM_SHAPES: Record<string, unknown> = {
  minimal: { typename: "BDTOPO_V3:batiment", limit: 100 },
  attribute: {
    typename: "ADMINEXPRESS-COG.LATEST:commune",
    where: [{ property: "population", operator: "gt", value: "1000" }],
    order_by: [{ property: "population", direction: "desc" }],
    limit: 50,
  },
  bbox: {
    typename: "BDTOPO_V3:batiment",
    bbox_filter: { west: 2.1, south: 48.7, east: 2.5, north: 48.9 },
    limit: 100,
  },
  intersects_point: {
    typename: "BDTOPO_V3:batiment",
    intersects_point_filter: { lon: 2.35, lat: 48.85 },
    limit: 100,
  },
  dwithin_point: {
    typename: "BDTOPO_V3:batiment",
    dwithin_point_filter: { lon: 2.35, lat: 48.85, distance_m: 500 },
    limit: 100,
  },
  intersects_feature: {
    typename: "BDTOPO_V3:batiment",
    intersects_feature_filter: { typename: "ADMINEXPRESS-COG.LATEST:commune", feature_id: "commune.33667" },
    where: [{ property: "hauteur", operator: "gt", value: "20" }],
    limit: 100,
  },
  travel_time: {
    typename: "BDTOPO_V3:batiment",
    travel_time_filter: { lon: 2.35, lat: 48.85, minutes: 15, profile: "pedestrian" },
    limit: 100,
  },
};

describe("proxy/token", () => {
  // --- Round-trip ---

  it.each(Object.entries(PARAM_SHAPES))("round-trips the %s param shape", (_name, params) => {
    const token = encodeToken(params, KEY);
    expect(decodeToken(token, KEY)).toEqual(params);
  });

  it("produces a URL-safe token (base64url alphabet only)", () => {
    const token = encodeToken(PARAM_SHAPES.intersects_feature, KEY);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces a different token each time (fresh IV)", () => {
    const a = encodeToken(PARAM_SHAPES.minimal, KEY);
    const b = encodeToken(PARAM_SHAPES.minimal, KEY);
    expect(a).not.toEqual(b);
    expect(decodeToken(a, KEY)).toEqual(decodeToken(b, KEY));
  });

  // --- Opacity ---

  it("leaks no plaintext value from the encoded params", () => {
    const token = encodeToken(PARAM_SHAPES.intersects_feature, KEY);
    for (const needle of ["BDTOPO_V3:batiment", "ADMINEXPRESS-COG.LATEST:commune", "commune.33667", "hauteur"]) {
      expect(token.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });

  // --- Tamper detection ---

  it("rejects a token decoded with the wrong key", () => {
    const token = encodeToken(PARAM_SHAPES.minimal, KEY);
    expect(() => decodeToken(token, OTHER_KEY)).toThrow(ProxyTokenTamperedError);
  });

  it("rejects a token with a flipped ciphertext byte", () => {
    const token = encodeToken(PARAM_SHAPES.minimal, KEY);
    const bytes = Buffer.from(token, "base64url");
    // Flip a byte inside the ciphertext region (after version(1)+iv(12), before the 16-byte tag).
    const target = 1 + 12 + 1;
    bytes[target] ^= 0xff;
    expect(() => decodeToken(bytes.toString("base64url"), KEY)).toThrow(ProxyTokenTamperedError);
  });

  it("rejects a truncated token", () => {
    const token = encodeToken(PARAM_SHAPES.minimal, KEY);
    const bytes = Buffer.from(token, "base64url");
    const truncated = bytes.subarray(0, bytes.length - 4).toString("base64url");
    expect(() => decodeToken(truncated, KEY)).toThrow(ProxyTokenTamperedError);
  });

  // --- Malformed input ---

  it("rejects a token that is too short to be an envelope", () => {
    const tooShort = Buffer.alloc(5, 1).toString("base64url");
    expect(() => decodeToken(tooShort, KEY)).toThrow(ProxyTokenMalformedError);
  });

  it("rejects an empty token (empty `/.json` path segment)", () => {
    // Rejection relies on the `+` quantifier in the base64url alphabet regex;
    // this pins that an empty string is treated as malformed input.
    expect(() => decodeToken("", KEY)).toThrow(ProxyTokenMalformedError);
  });

  it.each([
    ["trailing =", (t: string) => t + "="],
    ["trailing !", (t: string) => t + "!"],
    ["trailing newline", (t: string) => t + "\n"],
    ["embedded space", (t: string) => t.slice(0, 5) + " " + t.slice(5)],
    ["standard-base64 + and /", (t: string) => t.replaceAll("-", "+").replaceAll("_", "/")],
  ])("rejects non-canonical base64url input (%s)", (_label, corrupt) => {
    // Encode a few tokens and pick one that contains `-` or `_`, so the
    // standard-base64 substitution case actually alters the string.
    let token = "";
    for (const shape of Object.values(PARAM_SHAPES)) {
      token = encodeToken(shape, KEY);
      if (/[-_]/.test(token)) break;
    }
    const polluted = corrupt(token);
    expect(polluted).not.toEqual(token); // corruption must actually change the string
    expect(() => decodeToken(polluted, KEY)).toThrow(ProxyTokenMalformedError);
  });

  it("rejects an unknown version byte", () => {
    const token = encodeToken(PARAM_SHAPES.minimal, KEY);
    const bytes = Buffer.from(token, "base64url");
    bytes[0] = 99;
    expect(() => decodeToken(bytes.toString("base64url"), KEY)).toThrow(ProxyTokenMalformedError);
  });

  // --- Size guards ---

  it("rejects an oversized token before attempting to decode", () => {
    const huge = "A".repeat(MAX_TOKEN_CHARS + 1);
    expect(() => decodeToken(huge, KEY)).toThrow(ProxyTokenTooLargeError);
  });

  it("rejects a decompression bomb (small token, oversized inflate)", () => {
    // Hand-craft an envelope whose plaintext inflates beyond MAX_PLAINTEXT_BYTES.
    // Reuse the real primitives so the GCM tag is valid and only the size guard trips.
    const bomb = Buffer.alloc(1024 * 1024, 0x61); // 1 MiB of 'a', compresses tiny
    const compressed = brotliCompressSync(bomb);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", KEY, iv);
    cipher.setAAD(Buffer.from("geocontext-proxy-v1"));
    const ct = Buffer.concat([cipher.update(compressed), cipher.final()]);
    const tag = cipher.getAuthTag();
    const envelope = Buffer.concat([Buffer.from([1]), iv, ct, tag]).toString("base64url");

    expect(() => decodeToken(envelope, KEY)).toThrow(ProxyTokenTooLargeError);
  });

  // --- Encode/decode size symmetry ---

  it("rejects an oversized payload at encode time (never mints an undecodable token)", () => {
    // An abusively large input must fail at generation, not silently produce a
    // token the decoder would later reject on size.
    const abusive = {
      typename: "x",
      where: Array.from({ length: 2000 }, (_, i) => ({ property: `p${i}`, operator: "eq", value: `v${i}` })),
      limit: 1,
    };
    expect(() => encodeToken(abusive, KEY)).toThrow(ProxyTokenTooLargeError);
  });

  it("rejects an over-large but highly compressible payload at encode time", () => {
    // JSON > MAX_PLAINTEXT_BYTES but ultra-compressible: it would yield a short
    // token (passing the char cap) that the decoder rejects on inflate. The
    // plaintext-size check must catch it at encode time instead.
    const compressibleHuge = { typename: "x".repeat(70 * 1024), limit: 1 };
    expect(() => encodeToken(compressibleHuge, KEY)).toThrow(ProxyTokenTooLargeError);
  });

  it("guarantees every encoded token is decodable (symmetry invariant)", () => {
    // A payload just under the limit encodes AND decodes; the encoder never emits
    // a token that decode() would reject for length.
    const nearLimit = {
      typename: "BDTOPO_V3:batiment",
      where: Array.from({ length: 120 }, (_, i) => ({ property: `champ_numero_${i}`, operator: "eq", value: `valeur_${i}` })),
      limit: 100,
    };
    const token = encodeToken(nearLimit, KEY);
    expect(token.length).toBeLessThanOrEqual(MAX_TOKEN_CHARS);
    expect(decodeToken(token, KEY)).toEqual(nearLimit);
  });

  // --- Inclusive boundaries (guards use `>`, i.e. accept-at-equal) ---
  // These pin the `>` vs `>=` off-by-one: a token/plaintext exactly AT the limit
  // must be accepted, so a mutation to `>=` would fail here.

  it("accepts a token of exactly MAX_TOKEN_CHARS (size guard is not the failure)", () => {
    // A base64url string of exactly MAX_TOKEN_CHARS is not a real token, so it
    // fails deeper (version/GCM) — but crucially NOT with ProxyTokenTooLargeError.
    const atLimit = "A".repeat(MAX_TOKEN_CHARS);
    expect(atLimit.length).toBe(MAX_TOKEN_CHARS);
    let thrown: unknown;
    try {
      decodeToken(atLimit, KEY);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(ProxyTokenTooLargeError);
    // MAX_TOKEN_CHARS + 1 is the strictly-over case already covered above.
  });

  it("encodes a plaintext of exactly MAX_PLAINTEXT_BYTES (inclusive plaintext bound)", () => {
    // Build a params object whose JSON is exactly MAX_PLAINTEXT_BYTES bytes.
    const overhead = Buffer.byteLength(JSON.stringify({ typename: "", limit: 1 }));
    const pad = MAX_PLAINTEXT_BYTES - overhead;
    const atLimit = { typename: "x".repeat(pad), limit: 1 };
    expect(Buffer.byteLength(JSON.stringify(atLimit))).toBe(MAX_PLAINTEXT_BYTES);
    // Exactly at the limit must be accepted (guard is `>`); highly compressible,
    // so the resulting token stays well under MAX_TOKEN_CHARS.
    const token = encodeToken(atLimit, KEY);
    expect(decodeToken(token, KEY)).toEqual(atLimit);
  });

  // --- Non-serializable input (encode error contract is total) ---

  it("throws a typed error (not a raw TypeError) for non-JSON-serializable params", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const cases: unknown[] = [
      undefined,
      () => {},
      { big: 1n },
      circular,
    ];
    for (const params of cases) {
      expect(() => encodeToken(params, KEY)).toThrow(ProxyTokenMalformedError);
    }
  });

  // --- Key validation ---

  it("rejects a key of the wrong length", () => {
    const shortKey = randomBytes(16);
    expect(() => encodeToken(PARAM_SHAPES.minimal, shortKey)).toThrow(/32 bytes/);
  });
});
