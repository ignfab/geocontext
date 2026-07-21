import { afterEach, beforeEach, vi, describe, it, expect } from "vitest";
import fetch from "node-fetch";
import { resetEnv } from "../../src/config/env.js";

vi.mock("node-fetch", async () => {
    const actual = await vi.importActual<typeof import("node-fetch")>("node-fetch");

    return {
        ...actual,
        default: vi.fn(),
    };
});

import {
    fetchJSONGet,
    fetchJSONPost,
    fetchJSONPostWithLimit,
    fetchJSONGetWithLimit,
    parseJsonResponse,
    ResponseTooLargeError,
    ServiceResponseError,
} from "../../src/helpers/http.js";

const fetchMock = vi.mocked(fetch);

const USER_AGENT_ENV = "USER_AGENT";

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
    beforeEach(() => {
        fetchMock.mockReset();
        delete process.env.HTTP_TIMEOUT;
        resetEnv();
    });

    afterEach(() => {
        vi.useRealTimers();
        resetEnv();
    });

    it("should parse JSON responses", async () => {
        await expect(parseJsonResponse(createResponse('{"ok":true}'))).resolves.toEqual({ ok: true });
    });

    it("should use USER_AGENT for outbound requests when configured", async () => {
        const previousUserAgent = process.env[USER_AGENT_ENV];

        try {
            process.env[USER_AGENT_ENV] = "geocontext-tests/1.0";

            const fetchMock = vi.fn().mockResolvedValue(createResponse('{"ok":true}'));
            vi.resetModules();
            vi.doMock("node-fetch", () => ({
                default: fetchMock,
            }));

            const { fetchJSONGet } = await import("../../src/helpers/http.js");

            await fetchJSONGet("https://example.test");

            const requestOptions = fetchMock.mock.calls[0]?.[1];
            expect(requestOptions?.headers).toBeInstanceOf(Headers);
            expect((requestOptions?.headers as Headers).get("User-Agent")).toBe("geocontext-tests/1.0");
            expect((requestOptions?.headers as Headers).get("Accept")).toBe("application/json");
        } finally {
            if (previousUserAgent === undefined) {
                delete process.env[USER_AGENT_ENV];
            } else {
                process.env[USER_AGENT_ENV] = previousUserAgent;
            }

            vi.doUnmock("node-fetch");
            vi.resetModules();
        }
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

    it("should abort GET requests that exceed the configured timeout", async () => {
        vi.useFakeTimers();
        process.env.HTTP_TIMEOUT = "1";
        resetEnv();
        fetchMock.mockImplementation((_url, options) => {
            return new Promise((_, reject) => {
                options?.signal?.addEventListener("abort", () => {
                    const error = new Error("The operation was aborted.");
                    error.name = "AbortError";
                    reject(error);
                });
            }) as ReturnType<typeof fetch>;
        });

        const pendingRequest = expect(
            fetchJSONGet("https://example.test/slow")
        ).rejects.toMatchObject({
            name: "ServiceResponseError",
            httpStatus: 504,
            httpStatusText: "Gateway Timeout",
            serviceCode: "TIMEOUT",
            serviceDetail: "Le service distant n'a pas répondu dans le délai imparti (1000 ms).",
        });
        await vi.advanceTimersByTimeAsync(1000);
        await pendingRequest;
    });

    it("should abort POST requests that exceed the configured timeout", async () => {
        vi.useFakeTimers();
        process.env.HTTP_TIMEOUT = "2";
        resetEnv();
        fetchMock.mockImplementation((_url, options) => {
            return new Promise((_, reject) => {
                options?.signal?.addEventListener("abort", () => {
                    const error = new Error("The operation was aborted.");
                    error.name = "AbortError";
                    reject(error);
                });
            }) as ReturnType<typeof fetch>;
        });

        const pendingRequest = expect(
            fetchJSONPost(
                "https://example.test/slow",
                JSON.stringify({ hello: "world" }),
                { "Content-Type": "application/json" }
            )
        ).rejects.toMatchObject({
            name: "ServiceResponseError",
            httpStatus: 504,
            httpStatusText: "Gateway Timeout",
            serviceCode: "TIMEOUT",
            serviceDetail: "Le service distant n'a pas répondu dans le délai imparti (2000 ms).",
        });
        await vi.advanceTimersByTimeAsync(2000);
        await pendingRequest;
    });

    // --- fetchJSONPostWithLimit / fetchJSONGetWithLimit (size-bounded fetch: byte cap + JSON parse + labelled 502) ---
    // These exercise the shared bounded core (fetchTextWithLimit) through the two
    // public JSON wrappers; the byte-cap and non-2xx paths throw before the JSON parse.

    // Builds a response whose `body` yields the given chunks as an async iterable,
    // mirroring node-fetch's Node Readable stream.
    function createStreamResponse(
        chunks: string[],
        { status = 200, statusText = "OK", contentType = "application/json" }: { status?: number; statusText?: string; contentType?: string } = {},
    ) {
        return {
            status,
            statusText,
            ok: status >= 200 && status < 300,
            headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null) },
            body: (async function* () {
                for (const chunk of chunks) {
                    yield Buffer.from(chunk, "utf8");
                }
            })(),
        };
    }

    it("parses a bounded 2xx JSON body (chunks reassembled)", async () => {
        fetchMock.mockResolvedValue(
            createStreamResponse(['{"type":"Feature', 'Collection","features":[]}']) as unknown as Awaited<ReturnType<typeof fetch>>,
        );

        await expect(
            fetchJSONPostWithLimit("https://example.test", "body", {}, 1000, 1024, "WFS"),
        ).resolves.toEqual({ type: "FeatureCollection", features: [] });
    });

    it("aborts with ResponseTooLargeError when the body exceeds the byte cap", async () => {
        // Three 10-byte chunks = 30 bytes total; cap at 15 bytes trips on the 2nd chunk,
        // before any JSON parse.
        fetchMock.mockResolvedValue(
            createStreamResponse(["0123456789", "0123456789", "0123456789"]) as unknown as Awaited<ReturnType<typeof fetch>>,
        );

        await expect(
            fetchJSONPostWithLimit("https://example.test", "", {}, 1000, 15, "WFS"),
        ).rejects.toBeInstanceOf(ResponseTooLargeError);
    });

    it("accepts a body exactly at the byte cap (inclusive boundary)", async () => {
        // 10-byte JSON payload, cap 10 -> total > maxBytes is false, accepted then parsed.
        fetchMock.mockResolvedValue(createStreamResponse(['"01234567"']) as unknown as Awaited<ReturnType<typeof fetch>>);

        await expect(
            fetchJSONPostWithLimit("https://example.test", "", {}, 1000, 10, "WFS"),
        ).resolves.toBe("01234567");
    });

    it("throws ServiceResponseError with the upstream status on a non-2xx (XML error body)", async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows/1.1">
  <ows:Exception exceptionCode="InvalidParameterValue">
    <ows:ExceptionText>Illegal property name: geom</ows:ExceptionText>
  </ows:Exception>
</ows:ExceptionReport>`;
        fetchMock.mockResolvedValue(
            createStreamResponse([xml], { status: 400, statusText: "Bad Request", contentType: "application/xml" }) as unknown as Awaited<ReturnType<typeof fetch>>,
        );

        await expect(
            fetchJSONPostWithLimit("https://example.test", "", {}, 1000, 1024, "WFS"),
        ).rejects.toMatchObject({
            name: "ServiceResponseError",
            httpStatus: 400,
        });
    });

    it("rejects a non-2xx even when the body looks like a FeatureCollection", async () => {
        // The dangerous case: a 400 whose body would pass a naive shape check.
        // The HTTP status must win — it must NOT be handed back as a valid layer.
        const body = JSON.stringify({ type: "FeatureCollection", features: [] });
        fetchMock.mockResolvedValue(
            createStreamResponse([body], { status: 400, statusText: "Bad Request" }) as unknown as Awaited<ReturnType<typeof fetch>>,
        );

        await expect(
            fetchJSONPostWithLimit("https://example.test", "", {}, 1000, 1024, "WFS"),
        ).rejects.toBeInstanceOf(ServiceResponseError);
    });

    it("fetchJSONPostWithLimit maps a 2xx non-JSON body to a 502 naming the service via `label`", async () => {
        fetchMock.mockResolvedValue(
            createStreamResponse(["<html>upstream error page</html>"]) as unknown as Awaited<ReturnType<typeof fetch>>,
        );

        await expect(
            fetchJSONPostWithLimit("https://example.test", "body", {}, 1000, 1024, "WFS"),
        ).rejects.toMatchObject({
            name: "ServiceResponseError",
            httpStatus: 502,
            serviceCode: "invalid_upstream_body",
            message: expect.stringContaining("WFS"),
        });
    });

    it("fetchJSONGetWithLimit maps a 2xx non-JSON body to a 502 naming the service via `label`", async () => {
        fetchMock.mockResolvedValue(
            createStreamResponse(["not json at all"]) as unknown as Awaited<ReturnType<typeof fetch>>,
        );

        await expect(
            fetchJSONGetWithLimit("https://example.test", 1000, 1024, "d'isochrone"),
        ).rejects.toMatchObject({
            name: "ServiceResponseError",
            httpStatus: 502,
            serviceCode: "invalid_upstream_body",
            message: expect.stringContaining("d'isochrone"),
        });
    });

});
