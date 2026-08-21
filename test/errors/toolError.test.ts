import { vi, describe, it, expect } from "vitest";
import { z } from "zod";

import { ServiceResponseError } from "../../src/helpers/http.js";
import { normalizeToolError } from "../../src/errors/toolError.js";

describe("Test toolError helper", () => {
  it("should install the FR Zod error map at module load", async () => {
    vi.resetModules();
    const { z: freshZ } = await import("zod");

    // Reset to default messages, then import toolError to trigger module-level install.
    freshZ.setErrorMap((_, ctx) => ({ message: ctx.defaultError }));
    await import("../../src/errors/toolError.js");

    const schema = freshZ.object({
      lon: freshZ.number().max(180),
    });
    const result = schema.safeParse({ lon: 600 });

    if (result.success) {
      throw new Error("expected parse failure");
    }

    expect(result.error.issues[0].message).toContain("au plus");
  });

  it("should normalize a Zod error with French messages", () => {
    const schema = z.object({
      lon: z.number().max(180),
    }).strict();
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
    ["invalid type", z.object({ lon: z.number() }), { lon: "abc" }, "lon: "],
    ["string format", z.object({ site: z.string().url() }), { site: "nope" }, "site: "],
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
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["a"], message: "Valeur incohérente." });
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

  it("should still prefix a message that quotes some other parameter", () => {
    const schema = z.object({ a: z.string() }).superRefine((_value, ctx) => {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["a"],
        message: "Doit valoir le paramètre 'a' du parent.",
      });
    });
    const result = schema.safeParse({ a: "x" });

    if (result.success) {
      throw new Error("expected parse failure");
    }

    expect(normalizeToolError(result.error).detail).toContain("a: Doit valoir");
  });

  it("should not repeat a parameter name the message already carries", () => {
    const result = z.object({ text: z.string() }).safeParse({});

    if (result.success) {
      throw new Error("expected parse failure");
    }

    const payload = normalizeToolError(result.error);

    expect(payload.detail).toContain("Le paramètre 'text' est requis.");
    expect(payload.detail).not.toContain("text: Le paramètre");
  });

  it("should not repeat a parameter name an unknown-key message already carries", () => {
    const result = z.object({ a: z.string() }).strict().safeParse({ a: "x", nope: 1 });

    if (result.success) {
      throw new Error("expected parse failure");
    }

    const payload = normalizeToolError(result.error);

    expect(payload.detail).toContain("Le paramètre 'nope' n'est pas reconnu.");
    expect(payload.detail).not.toContain("nope: ");
  });
});
