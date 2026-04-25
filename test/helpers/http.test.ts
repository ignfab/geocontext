import { parseJsonResponse } from "../../src/helpers/http.js";

function createResponse(
    body: string,
    contentType = "application/json",
    {
        status = 200,
        statusText = "OK",
        ok,
    }: { status?: number; statusText?: string; ok?: boolean } = {}
) {
    return {
        status,
        statusText,
        ok: ok ?? (status >= 200 && status < 300),
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

    it("should expose structured details for extracted OGC XML errors", async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows/1.1">
  <ows:Exception exceptionCode="InvalidParameterValue">
    <ows:ExceptionText>Illegal property name: geom</ows:ExceptionText>
  </ows:Exception>
</ows:ExceptionReport>`;

        await expect(parseJsonResponse(createResponse(xml, "application/xml"))).rejects.toMatchObject({
            name: "ServiceResponseError",
            serviceCode: "InvalidParameterValue",
            serviceDetail: "Illegal property name: geom",
        });
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

    it("should extract code and text from GeoServer JSON exceptions payloads", async () => {
        const geoserverJson = JSON.stringify({
            version: null,
            exceptions: [
                {
                    code: "InvalidParameterValue",
                    locator: "GetFeature",
                    text: "Requested property: toto=toto is not available for BDTOPO_V3:batiment.",
                },
            ],
        });

        await expect(
            parseJsonResponse(
                createResponse(geoserverJson, "application/json", {
                    status: 400,
                    statusText: "Bad Request",
                })
            )
        ).rejects.toThrow(
            "Erreur HTTP du service (400 Bad Request): Requested property: toto=toto is not available for BDTOPO_V3:batiment."
        );

        await expect(
            parseJsonResponse(
                createResponse(geoserverJson, "application/json", {
                    status: 400,
                    statusText: "Bad Request",
                })
            )
        ).rejects.toMatchObject({
            name: "ServiceResponseError",
            serviceCode: "InvalidParameterValue",
            serviceDetail: "Requested property: toto=toto is not available for BDTOPO_V3:batiment.",
            httpStatusText: "400 Bad Request",
        });
    });

    it("should trust explicit ok=false even with a 2xx status", async () => {
        await expect(
            parseJsonResponse(
                createResponse('{"message":"bad filter"}', "application/json", {
                    status: 200,
                    statusText: "OK",
                    ok: false,
                })
            )
        ).rejects.toThrow("Erreur HTTP du service (200 OK): bad filter");
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

    it("should keep structured XML error details on HTTP failures", async () => {
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
        ).rejects.toMatchObject({
            name: "ServiceResponseError",
            serviceCode: "InvalidParameterValue",
            serviceDetail: "Illegal property name: geom",
            httpStatusText: "400 Bad Request",
        });
    });

    it("should expose structured details for non-2xx JSON responses", async () => {
        await expect(
            parseJsonResponse(
                createResponse('{"message":"bad filter"}', "application/json", {
                    status: 400,
                    statusText: "Bad Request",
                })
            )
        ).rejects.toMatchObject({
            name: "ServiceResponseError",
            serviceDetail: "bad filter",
            httpStatusText: "400 Bad Request",
        });
    });

    it("should extract code and description from altimetry error payloads", async () => {
        const payload = JSON.stringify({
            error: {
                code: "BAD_PARAMETER",
                description: "The parameter [lat] is missing.",
            },
        });

        await expect(
            parseJsonResponse(
                createResponse(payload, "application/json", {
                    status: 400,
                    statusText: "Bad Request",
                })
            )
        ).rejects.toThrow("Erreur HTTP du service (400 Bad Request): The parameter [lat] is missing.");

        await expect(
            parseJsonResponse(
                createResponse(payload, "application/json", {
                    status: 400,
                    statusText: "Bad Request",
                })
            )
        ).rejects.toMatchObject({
            name: "ServiceResponseError",
            serviceCode: "BAD_PARAMETER",
            serviceDetail: "The parameter [lat] is missing.",
            httpStatusText: "400 Bad Request",
        });
    });

    it("should extract detailed messages from autocomplete error payloads", async () => {
        const payload = JSON.stringify({
            code: 400,
            message: "Failed parsing query",
            detail: [
                "text: required param",
            ],
        });

        await expect(
            parseJsonResponse(
                createResponse(payload, "application/json", {
                    status: 400,
                    statusText: "Bad Request",
                })
            )
        ).rejects.toThrow("Erreur HTTP du service (400 Bad Request): text: required param");

        await expect(
            parseJsonResponse(
                createResponse(payload, "application/json", {
                    status: 400,
                    statusText: "Bad Request",
                })
            )
        ).rejects.toMatchObject({
            name: "ServiceResponseError",
            serviceCode: "400",
            serviceDetail: "text: required param",
            httpStatusText: "400 Bad Request",
        });
    });

    it("should normalize non-2xx HTML responses as upstream service errors", async () => {
        const html = "<!DOCTYPE html><html><body><h1>Bad Request</h1><p>Missing lat parameter</p></body></html>";

        await expect(
            parseJsonResponse(
                createResponse(html, "text/html", {
                    status: 400,
                    statusText: "Bad Request",
                })
            )
        ).rejects.toThrow("Erreur HTTP du service (400 Bad Request):");

        await expect(
            parseJsonResponse(
                createResponse(html, "text/html", {
                    status: 400,
                    statusText: "Bad Request",
                })
            )
        ).rejects.toMatchObject({
            name: "ServiceResponseError",
            serviceDetail: "<!DOCTYPE html><html><body><h1>Bad Request</h1><p>Missing lat parameter</p></body></html>",
            httpStatusText: "400 Bad Request",
        });
    });

    it("should not infer non-explicit JSON keys as known error detail fields", async () => {
        const payload = JSON.stringify({
            title: "This key is not part of known JSON error payloads",
            msg: "Neither is this one",
            errorMessage: "Nor this one",
        });

        await expect(
            parseJsonResponse(
                createResponse(payload, "application/json", {
                    status: 400,
                    statusText: "Bad Request",
                })
            )
        ).rejects.toMatchObject({
            name: "ServiceResponseError",
            serviceDetail: "{\"title\":\"This key is not part of known JSON error payloads\",\"msg\":\"Neither is this one\",\"errorMessage\":\"Nor this one\"}",
            httpStatusText: "400 Bad Request",
        });
    });

});
