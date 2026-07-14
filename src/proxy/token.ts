/**
 * Opaque, tamper-evident URL token codec for the stateless WFS proxy.
 *
 * Encodes a validated query-params object into a compact, URL-safe string so the
 * LLM can hand MCP Carto a short, opaque `data_url` it cannot parse or rebuild
 * (preventing it from reconstructing a WFS `cql_filter` by itself).
 *
 * Pipeline: JSON → brotli → AES-256-GCM → base64url.
 * Envelope: base64url( version(1) ‖ iv(12) ‖ ciphertext ‖ authTag(16) ).
 *
 * This module is intentionally free of any WFS/tool knowledge: it serializes and
 * restores a plain object. The caller re-validates the decoded object against the
 * real Zod schema, so a leaked key can never bypass input validation.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import {
  brotliCompressSync,
  brotliDecompressSync,
  constants as zlibConstants,
} from "node:zlib";

// --- Constants ---

/** Envelope format version. Lets a future dual-key rotation coexist without a format change. */
const TOKEN_VERSION = 1;

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

/** Bound the accepted `q` string before any decode work, to reject oversized input cheaply. */
export const MAX_TOKEN_CHARS = 4000;

/**
 * Strict base64url alphabet. `Buffer.from(x, "base64url")` is permissive — it silently
 * ignores `!`, `=`, whitespace, and even accepts standard-base64 `+`/`/` — so a token
 * with stray characters would decode to the same bytes. That is not a forgery vector
 * (the GCM tag still guards the content), but we reject non-canonical input up front for
 * a clean contract and clearer diagnostics.
 */
const BASE64URL_ALPHABET = /^[A-Za-z0-9_-]+$/;

/** Bound brotli inflate output to defuse a decompression bomb before allocation. */
export const MAX_PLAINTEXT_BYTES = 64 * 1024;

/**
 * Additional authenticated data bound into the GCM tag. Not secret; it ties a token
 * to this codec/purpose so a ciphertext minted for another context fails to authenticate.
 */
const AAD = Buffer.from("geocontext-proxy-v1");

// --- Errors ---

/**
 * Raised when a token cannot be decoded because it is structurally malformed:
 * not base64url, wrong length, or an unknown version byte.
 */
export class ProxyTokenMalformedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProxyTokenMalformedError";
  }
}

/**
 * Raised when a token fails GCM authentication: it was tampered with, truncated,
 * or produced with a different key. Never fall back to trusting such a token.
 */
export class ProxyTokenTamperedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProxyTokenTamperedError";
  }
}

/**
 * Raised when the decompressed plaintext would exceed `MAX_PLAINTEXT_BYTES`
 * (decompression-bomb guard) or the raw token exceeds `MAX_TOKEN_CHARS`.
 */
export class ProxyTokenTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProxyTokenTooLargeError";
  }
}

// --- Key Handling ---

/**
 * Validates that a decoded secret is exactly the AES-256 key size.
 *
 * @param key Raw key material.
 * @returns The same buffer once its length is checked.
 */
function assertKey(key: Buffer): Buffer {
  if (key.length !== KEY_BYTES) {
    throw new Error(`Proxy URL secret must decode to exactly ${KEY_BYTES} bytes, got ${key.length}.`);
  }
  return key;
}

// --- Encode ---

/**
 * Encodes a params object into an opaque, tamper-evident URL token.
 *
 * @param params Plain object to carry (already validated by the caller).
 * @param key 32-byte symmetric key.
 * @returns A URL-safe base64url token.
 */
export function encodeToken(params: unknown, key: Buffer): string {
  assertKey(key);

  // Serialize defensively so the encode path has the same total typed-error
  // contract as decode: JSON.stringify throws on BigInt/circular values, and
  // returns `undefined` (not a string) for `undefined`/function/symbol inputs.
  // Both must surface as a typed error, never a raw TypeError from Buffer.from.
  let json: string | undefined;
  try {
    json = JSON.stringify(params);
  } catch {
    throw new ProxyTokenMalformedError("Params are not serializable to JSON.");
  }
  if (json === undefined) {
    throw new ProxyTokenMalformedError("Params serialized to undefined (not a JSON value).");
  }

  const plaintext = Buffer.from(json, "utf8");

  // Symmetry invariant (plaintext axis): the decoder caps inflated output at
  // MAX_PLAINTEXT_BYTES, so reject an over-large plaintext here too. Without this,
  // a large but highly compressible payload yields a short token that passes the
  // MAX_TOKEN_CHARS check below yet dies on decode. Check before Brotli.
  if (plaintext.length > MAX_PLAINTEXT_BYTES) {
    throw new ProxyTokenTooLargeError(
      `Payload (${plaintext.length} bytes) exceeds ${MAX_PLAINTEXT_BYTES}. Narrow the query (fewer/shorter where/select clauses).`,
    );
  }

  const compressed = brotliCompressSync(plaintext, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
      [zlibConstants.BROTLI_PARAM_SIZE_HINT]: plaintext.length,
    },
  });

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const envelope = Buffer.concat([Buffer.from([TOKEN_VERSION]), iv, ciphertext, authTag]);
  const token = envelope.toString("base64url");

  // Symmetry invariant: never emit a token the decoder would reject on size.
  // Fail at generation (so the caller surfaces a clear "narrow the query" error)
  // rather than minting a token that dies on the first fetch.
  if (token.length > MAX_TOKEN_CHARS) {
    throw new ProxyTokenTooLargeError(
      `Encoded token (${token.length} chars) exceeds ${MAX_TOKEN_CHARS}. Narrow the query (fewer where/select clauses).`,
    );
  }

  return token;
}

// --- Decode ---

/**
 * Decodes an opaque URL token back into the original params object.
 *
 * @param token base64url token produced by {@link encodeToken}.
 * @param key 32-byte symmetric key.
 * @returns The decoded params object (as `unknown`; the caller must re-validate it).
 * @throws {ProxyTokenTooLargeError} When the raw token or its inflated plaintext is too large.
 * @throws {ProxyTokenMalformedError} When the token is not decodable base64url, too short, or an unknown version.
 * @throws {ProxyTokenTamperedError} When GCM authentication fails (tamper / truncation / wrong key).
 */
export function decodeToken(token: string, key: Buffer): unknown {
  assertKey(key);

  if (token.length > MAX_TOKEN_CHARS) {
    throw new ProxyTokenTooLargeError(`Token exceeds ${MAX_TOKEN_CHARS} characters.`);
  }

  if (!BASE64URL_ALPHABET.test(token)) {
    throw new ProxyTokenMalformedError("Token contains non-base64url characters.");
  }

  const envelope = Buffer.from(token, "base64url");
  const minLength = 1 + IV_BYTES + AUTH_TAG_BYTES;
  if (envelope.length < minLength) {
    throw new ProxyTokenMalformedError("Token is too short to be a valid envelope.");
  }

  const version = envelope[0];
  if (version !== TOKEN_VERSION) {
    throw new ProxyTokenMalformedError(`Unsupported token version: ${version}.`);
  }

  const iv = envelope.subarray(1, 1 + IV_BYTES);
  const authTag = envelope.subarray(envelope.length - AUTH_TAG_BYTES);
  const ciphertext = envelope.subarray(1 + IV_BYTES, envelope.length - AUTH_TAG_BYTES);

  let compressed: Buffer;
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(authTag);
    compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // GCM final() throws on any tag mismatch — tampering, truncation, or a wrong key.
    throw new ProxyTokenTamperedError("Token authentication failed (tampered, truncated, or wrong key).");
  }

  let plaintext: Buffer;
  try {
    plaintext = brotliDecompressSync(compressed, {
      maxOutputLength: MAX_PLAINTEXT_BYTES,
    });
  } catch (error) {
    // node:zlib throws a range error once output would exceed maxOutputLength.
    if (error instanceof RangeError) {
      throw new ProxyTokenTooLargeError(`Decompressed payload exceeds ${MAX_PLAINTEXT_BYTES} bytes.`);
    }
    throw new ProxyTokenMalformedError("Token payload could not be decompressed.");
  }

  try {
    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new ProxyTokenMalformedError("Token payload is not valid JSON.");
  }
}
