import { z } from "zod";
import { vi } from "vitest";

import { ServiceResponseError } from "../../src/helpers/http.js";
import { normalizeToolError } from "../../src/helpers/errors/toolError.js";

describe("Test toolError helper", () => {
  it("should install the FR Zod error map at module load", async () => {
    vi.resetModules();
    const { z: freshZ } = await import("zod");

    // Reset to default messages, then import toolError to trigger module-level install.
    freshZ.setErrorMap((issue, ctx) => ({ message: ctx.defaultError }));
    await import("../../src/helpers/errors/toolError.js");

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
          detail: "le nom du type ne doit pas être vide",
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
});
