import { vi, describe, it, expect } from "vitest";
import { z } from "zod";

import { ServiceResponseError } from "../../src/helpers/http.js";
import { normalizeToolError } from "../../src/errors/toolError.js";
import {
  ProxyTokenMalformedError,
  ProxyTokenTamperedError,
  ProxyTokenTooLargeError,
} from "../../src/proxy/token.js";
import { FeatureNotFoundError, FeatureCardinalityError } from "../../src/wfs/byId.js";
import { expectFrenchIssue } from "../tools/helpers/errorAssertions.js";

describe("Test toolError helper", () => {
  it("should install the FR Zod error map at module load", async () => {
    vi.resetModules();
    const { z: freshZ } = await import("zod");

    // Reset to default messages, then import toolError to trigger module-level install.
    freshZ.config({ customError: undefined, localeError: undefined });
    await import("../../src/errors/toolError.js");

    const schema = freshZ.object({
      lon: freshZ.number().max(180),
    });
    const result = schema.safeParse({ lon: 600 });

    if (result.success) {
      throw new Error("expected parse failure");
    }

    expectFrenchIssue(normalizeToolError(result.error).detail, "lon", /180/);
  });

  it("should normalize a Zod error with French messages", () => {
    const schema = z.strictObject({
      lon: z.number().max(180),
    });
    const result = schema.safeParse({
      lon: 600,
      unexpected: true,
    });

    if (result.success) {
      throw new Error("expected parse failure");
    }

    const payload = normalizeToolError(result.error);

    expect(payload).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      title: "Paramètres d’outil invalides",
      errors: expect.arrayContaining([
        expect.objectContaining({
          name: "lon",
          code: "too_big",
        }),
        expect.objectContaining({
          code: "unknown_parameter",
          detail: expect.stringContaining("unexpected"),
        }),
      ]),
    });
    expect(payload.detail).toContain("Paramètres invalides");
  });

  it("should keep custom French validation messages when present", () => {
    const schema = z.object({
      typename: z.string().min(1, "le nom du type ne doit pas être vide"),
    });
    const result = schema.safeParse({
      typename: "",
    });

    if (result.success) {
      throw new Error("expected parse failure");
    }

    const payload = normalizeToolError(result.error);
    expect(payload).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({
          name: "typename",
          code: "too_small",
          detail: "typename: le nom du type ne doit pas être vide",
        }),
      ]),
    });
  });

  it("should normalize ServiceResponseError as upstream error", () => {
    const payload = normalizeToolError(new ServiceResponseError("bad filter", {
      http: {
        status: 400,
        statusText: "400 Bad Request",
      },
      service: {
        code: "InvalidParameterValue",
        detail: "bad filter",
      },
    }));

    expect(payload).toMatchObject({
      type: "urn:geocontext:problem:upstream-invalid-request",
      title: "Requête rejetée par le service amont",
      detail: "Le service distant a rejeté la requête : bad filter",
      upstream: {
        status: 400,
      },
      errors: [
        {
          code: "invalid_parameter_value",
          detail: "bad filter",
        },
      ],
    });
  });

  it("should normalize generic errors as execution error", () => {
    const payload = normalizeToolError(new Error("boom"));

    expect(payload).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
      title: "Erreur d’exécution de l’outil",
      detail: "boom",
      errors: [
        {
          code: "execution_error",
          detail: "boom",
        },
      ],
    });
  });

  it.each([
    [new ProxyTokenTooLargeError("too large"), "proxy-url-error", "proxy_url_too_large"],
    [new ProxyTokenMalformedError("malformed"), "proxy-url-error", "proxy_url_error"],
    [new ProxyTokenTamperedError("tampered"), "proxy-url-error", "proxy_url_error"],
    [new FeatureNotFoundError("introuvable"), "feature-not-found", "feature_not_found"],
    [new FeatureCardinalityError("plusieurs objets"), "feature-cardinality", "feature_cardinality"],
  ])("should normalize %s with a stable type and code", (error, type, code) => {
    expect(normalizeToolError(error)).toMatchObject({
      type: `urn:geocontext:problem:${type}`,
      errors: [{ code }],
    });
  });

  it("should not classify generic errors with service-like fields as upstream errors", () => {
    const payload = normalizeToolError(Object.assign(new Error("boom"), {
      serviceCode: "InvalidParameterValue",
    }));

    expect(payload).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
      detail: "boom",
    });
  });
  it.each([
    ["enum", z.object({ direction: z.enum(["asc", "desc"]) }), { direction: "sideways" }, "direction: "],
    ["missing enum", z.object({ direction: z.enum(["asc", "desc"]) }), {}, "direction: Paramètre requis."],
    ["invalid type", z.object({ lon: z.number() }), { lon: "abc" }, "lon: "],
    ["string format", z.object({ site: z.url() }), { site: "nope" }, "site: "],
    ["out of range", z.object({ lon: z.number().max(180) }), { lon: 600 }, "lon: "],
    [
      "nested field",
      z.object({ bbox: z.object({ lon: z.number().max(180) }) }),
      { bbox: { lon: 999 } },
      "bbox.lon: ",
    ],
    [
      "custom refinement",
      z.object({ a: z.number() }).superRefine((_value, ctx) => {
        ctx.addIssue({ code: "custom", path: ["a"], message: "Valeur incohérente." });
      }),
      { a: 1 },
      "a: Valeur incohérente.",
    ],
    [
      "array element",
      z.object({ tags: z.array(z.string()) }),
      { tags: ["ok", 5] },
      "tags[1]: ",
    ],
  ])("should name the offending parameter for %s issues", (_label, schema, input, expectedPrefix) => {
    const result = schema.safeParse(input);

    if (result.success) {
      throw new Error("expected parse failure");
    }

    expect(normalizeToolError(result.error).detail).toContain(expectedPrefix);
  });

  it("should keep array element errors distinguishable by index", () => {
    const result = z.object({ tags: z.array(z.string()) }).safeParse({ tags: [1, 2] });

    if (result.success) {
      throw new Error("expected parse failure");
    }

    const payload = normalizeToolError(result.error);

    expect(payload.errors.map((error) => error.name)).toEqual(["tags[0]", "tags[1]"]);
  });

  it("should keep root-level array elements distinguishable", () => {
    const result = z.array(z.string()).safeParse([1, 2]);

    if (result.success) {
      throw new Error("expected parse failure");
    }

    const payload = normalizeToolError(result.error);

    // No field name to suffix, but the indices must survive or the dedupe
    // would collapse both elements into a single nameless error.
    expect(payload.errors.map((error) => error.name)).toEqual(["[0]", "[1]"]);
  });

  it("should not repeat a parameter name an unknown-key message already carries", () => {
    const result = z.strictObject({ a: z.string() }).safeParse({ a: "x", nope: 1 });

    if (result.success) {
      throw new Error("expected parse failure");
    }

    const payload = normalizeToolError(result.error);

    expect(payload.detail).toContain("Le paramètre 'nope' n'est pas reconnu.");
    expect(payload.detail).not.toContain("nope: ");
  });

  it("should name a nested unknown key by its full path", () => {
    const point = z.strictObject({ lon: z.number() });
    const schema = z.object({ departure: point, arrival: point, where: z.array(point) });
    const result = schema.safeParse({ departure: { lon: 1, alt: 1 }, arrival: { lon: 1, alt: 1 }, where: [{ lon: 1, alt: 1 }] });

    if (result.success) {
      throw new Error("expected parse failure");
    }

    const payload = normalizeToolError(result.error);

    // The same key in three objects stays three errors.
    expect(payload.errors.map((error) => error.name)).toEqual(["departure.alt", "arrival.alt", "where[0].alt"]);
    expect(payload.detail).toContain("Le paramètre 'where[0].alt' n'est pas reconnu.");
  });
  it("should name every omitted parameter when truncating the summary", () => {
    const keys = ["a", "b", "c", "d", "e", "f", "g"];
    const shape = Object.fromEntries(keys.map((key) => [key, z.number().max(1)]));
    const input = Object.fromEntries(keys.map((key) => [key, 9]));
    const result = z.object(shape).safeParse(input);

    if (result.success) {
      throw new Error("expected parse failure");
    }

    const payload = normalizeToolError(result.error);

    // The first five are spelled out, the rest are named but not detailed.
    expectFrenchIssue(payload.detail, "a", /1/);
    expectFrenchIssue(payload.detail, "e", /1/);
    expect(payload.detail).toContain("(et 2 autre(s) erreur(s) sur : f, g).");
  });

  it("should not truncate when the summary fits", () => {
    const result = z.object({ a: z.number().max(1), b: z.number().max(1) })
      .safeParse({ a: 9, b: 9 });

    if (result.success) {
      throw new Error("expected parse failure");
    }

    expect(normalizeToolError(result.error).detail).not.toContain("autre(s) erreur(s)");
  });

  it("should drop duplicate messages that share a parameter name", () => {
    const schema = z.object({
      a: z.number().superRefine((_value, ctx) => {
        ctx.addIssue({ code: "custom", message: "Valeur incohérente." });
        ctx.addIssue({ code: "custom", message: "Valeur incohérente." });
      }),
    });
    const result = schema.safeParse({ a: 1 });

    if (result.success) {
      throw new Error("expected parse failure");
    }

    expect(normalizeToolError(result.error).errors).toHaveLength(1);
  });

  it("should keep same-wording errors on different parameters", () => {
    const result = z.object({ tags: z.array(z.string()) }).safeParse({ tags: [1, 2] });

    if (result.success) {
      throw new Error("expected parse failure");
    }

    // Identical wording, distinct parameters: the dedupe must not merge these.
    expect(normalizeToolError(result.error).errors).toHaveLength(2);
  });
});
