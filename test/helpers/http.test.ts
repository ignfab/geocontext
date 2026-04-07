import { parseJsonResponse } from "../../src/helpers/http.js";

function createResponse(
    body: string,
    contentType = "application/json",
    {
        status = 200,
        statusText = "OK",
        ok,
        includeOk = true,
    }: { status?: number; statusText?: string; ok?: boolean; includeOk?: boolean } = {}
) {
    return {
        status,
        statusText,
        ...(includeOk ? { ok: ok ?? (status >= 200 && status < 300) } : {}),
        headers: {
            get(name: string) {
                return name.toLowerCase() === "content-type" ? contentType : null;
            },
        },
        async text() {
            return body;
        },
    };
}

describe("Test HTTP helpers", () => {
    it("should parse JSON responses", async () => {
        await expect(parseJsonResponse(createResponse('{"ok":true}'))).resolves.toEqual({ ok: true });
    });

    it("should extract OGC XML errors", async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows/1.1">
  <ows:Exception exceptionCode="InvalidParameterValue">
    <ows:ExceptionText>Illegal property name: geom</ows:ExceptionText>
  </ows:Exception>
</ows:ExceptionReport>`;

        await expect(parseJsonResponse(createResponse(xml, "application/xml"))).rejects.toThrow(
            "InvalidParameterValue: Illegal property name: geom"
        );
    });

    it("should fail explicitly on empty responses", async () => {
        await expect(parseJsonResponse(createResponse(""))).rejects.toThrow(
            "Réponse vide du service (200 OK)"
        );
    });

    it("should fail explicitly on non exploitable XML responses", async () => {
        const xml = `<FeatureCollection><feature /></FeatureCollection>`;

        await expect(parseJsonResponse(createResponse(xml, "application/xml"))).rejects.toThrow(
            "Réponse XML non exploitable du service (200 OK, content-type=application/xml, extrait=<FeatureCollection><feature /></FeatureCollection>)"
        );
    });

    it("should fail explicitly on invalid JSON responses", async () => {
        await expect(parseJsonResponse(createResponse("not-json", "text/plain"))).rejects.toThrow(
            "Réponse JSON invalide du service (200 OK, content-type=text/plain, extrait=not-json)"
        );
    });

    it("should reject non-2xx JSON responses with their message", async () => {
        await expect(
            parseJsonResponse(
                createResponse('{"message":"bad filter"}', "application/json", {
                    status: 400,
                    statusText: "Bad Request",
                })
            )
        ).rejects.toThrow("Erreur HTTP du service (400 Bad Request): bad filter");
    });

    it("should reject responses with invalid status when ok is absent", async () => {
        await expect(
            parseJsonResponse(
                createResponse('{"message":"bad filter"}', "application/json", {
                    status: Number.NaN,
                    statusText: "Bad Request",
                    includeOk: false,
                })
            )
        ).rejects.toThrow("Erreur HTTP du service (Bad Request): bad filter");
    });

    it("should reject non-2xx XML responses with extracted OGC errors", async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows/1.1">
  <ows:Exception exceptionCode="InvalidParameterValue">
    <ows:ExceptionText>Illegal property name: geom</ows:ExceptionText>
  </ows:Exception>
</ows:ExceptionReport>`;

        await expect(
            parseJsonResponse(
                createResponse(xml, "application/xml", {
                    status: 400,
                    statusText: "Bad Request",
                })
            )
        ).rejects.toThrow(
            "Erreur HTTP du service (400 Bad Request): InvalidParameterValue: Illegal property name: geom"
        );
    });
});
