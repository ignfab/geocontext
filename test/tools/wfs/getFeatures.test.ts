import type { Collection } from "@ignfab/gpf-schema-store";

import GpfWfsGetFeaturesTool from "../../../src/tools/GpfWfsGetFeaturesTool";

describe("Test GpfWfsGetFeaturesTool",() => {
    class TestableGpfWfsGetFeaturesTool extends GpfWfsGetFeaturesTool {
        public featureTypes: Record<string, Collection> = {};
        public requests: Array<{ url: string; query: Record<string, string>; body: string }> = [];
        public nextResponse: unknown = null;

        respond(data: unknown) {
            return this.createSuccessResponse(data);
        }

        protected async getFeatureType(typename: string) {
            const featureType = this.featureTypes[typename];
            if (!featureType) {
                throw new Error(`unexpected typename ${typename}`);
            }
            return featureType;
        }

        protected async fetchFeatureCollection(request: { url: string; query: Record<string, string>; body: string }) {
            this.requests.push(request);
            return this.nextResponse;
        }
    }

    const polygonFeatureType: Collection = {
        id: "ADMINEXPRESS-COG.LATEST:commune",
        namespace: "ADMINEXPRESS-COG.LATEST",
        name: "commune",
        title: "Commune",
        description: "Description de test",
        properties: [
            { name: "code_insee", type: "string" },
            { name: "population", type: "integer" },
            { name: "actif", type: "boolean" },
            { name: "geometrie", type: "multipolygon", defaultCrs: "EPSG:4326" },
        ],
    };

    const pointFeatureType: Collection = {
        id: "BDTOPO_V3:point_d_acces",
        namespace: "BDTOPO_V3",
        name: "point_d_acces",
        title: "Point d'acces",
        description: "Description de test",
        properties: [
            { name: "cleabs", type: "string" },
            { name: "geometrie", type: "point", defaultCrs: "EPSG:4326" },
        ],
    };

    const multipointFeatureType: Collection = {
        id: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS:localisant",
        namespace: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS",
        name: "localisant",
        title: "Localisant",
        description: "Description de test",
        properties: [
            { name: "gid", type: "integer" },
            { name: "idu", type: "string" },
            { name: "geometrie", type: "multipoint", defaultCrs: "EPSG:4326" },
        ],
    };

    const featureCollection: {
        type: string;
        features: Array<{
            type: string;
            id: string;
            geometry: null;
            properties: {
                code_insee: string;
            };
        }>;
        totalFeatures: number;
    } = {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                id: "commune.1",
                geometry: null,
                properties: {
                    code_insee: "01001",
                },
            },
        ],
        totalFeatures: 34877,
    };

    it("should expose an enriched MCP definition", () => {
        const tool = new GpfWfsGetFeaturesTool();
        expect(tool.toolDefinition.title).toEqual("Lecture d’objets WFS");
        expect(tool.toolDefinition.inputSchema.properties?.typename).toMatchObject({
            type: "string",
            minLength: 1,
        });
        expect(tool.toolDefinition.inputSchema.properties?.limit).toMatchObject({
            type: "integer",
            minimum: 1,
            maximum: 1000,
        });
        expect(tool.toolDefinition.inputSchema.properties?.select).toMatchObject({
            type: "array",
        });
        expect(tool.toolDefinition.inputSchema.properties?.order_by).toMatchObject({
            type: "array",
        });
        expect(tool.toolDefinition.inputSchema.properties?.where).toMatchObject({
            type: "array",
        });
        expect(tool.toolDefinition.outputSchema).toBeUndefined();
    });

    it("should return a FeatureCollection without structuredContent for results", () => {
        const tool = new TestableGpfWfsGetFeaturesTool();
        const response = tool.respond(featureCollection);

        expect("isError" in response).toBe(false);
        expect(response.structuredContent).toBeUndefined();
        expect(response.content[0]).toMatchObject({
            type: "text",
        });
        const textContent = response.content[0];
        if (textContent.type !== "text") {
            throw new Error("expected text content");
        }
        expect(JSON.parse(textContent.text)).toMatchObject({
            type: "FeatureCollection",
            features: expect.any(Array),
        });
    });

    it("should return text content and structuredContent for hits", () => {
        const tool = new TestableGpfWfsGetFeaturesTool();
        const response = tool.respond({
            result_type: "hits",
            totalFeatures: featureCollection.totalFeatures,
        });

        expect("isError" in response).toBe(false);
        expect(response.content[0]).toMatchObject({
            type: "text",
        });
        const textContent = response.content[0];
        if (textContent.type !== "text") {
            throw new Error("expected text content");
        }
        expect(Number(JSON.parse(textContent.text))).toBeGreaterThan(0);
        expect(response.structuredContent).toMatchObject({
            result_type: "hits",
            totalFeatures: expect.any(Number),
        });
    });

    it("should return text content and structuredContent for request", async () => {
        const tool = new TestableGpfWfsGetFeaturesTool();
        tool.featureTypes[polygonFeatureType.id] = polygonFeatureType;
        const response = await tool.toolCall({
            params: {
                name: "gpf_wfs_get_features",
                arguments: {
                    typename: "ADMINEXPRESS-COG.LATEST:commune",
                    result_type: "request",
                    where: [
                        {
                            property: "code_insee",
                            operator: "eq",
                            value: "01001",
                        },
                    ],
                },
            },
        });

        expect(response.isError).toBeUndefined();
        expect(response.content[0]).toMatchObject({
            type: "text",
        });
        const textContent = response.content[0];
        if (textContent.type !== "text") {
            throw new Error("expected text content");
        }
        const request = JSON.parse(textContent.text);
        expect(request.method).toEqual("POST");
        expect(request.url).toContain("https://data.geopf.fr/wfs");
        expect(request.query.service).toEqual("WFS");
        expect(request.body).toContain("cql_filter=");
        expect(response.structuredContent).toMatchObject({
            result_type: "request",
            method: "POST",
        });
    });

    it("should return isError=true for invalid input", async () => {
        const tool = new GpfWfsGetFeaturesTool();
        const response = await tool.toolCall({
            params: {
                name: "gpf_wfs_get_features",
                arguments: {
                    typename: "",
                },
            },
        });

        expect(response.isError).toBe(true);
        expect(response.content[0]).toMatchObject({
            type: "text",
        });
        const textContent = response.content[0];
        if (textContent.type !== "text") {
            throw new Error("expected text content");
        }
        expect(textContent.text).toContain("le nom du type ne doit pas être vide");
    });

    it("should reject legacy inputs removed from the public schema", async () => {
        const tool = new GpfWfsGetFeaturesTool();
        const response = await tool.toolCall({
            params: {
                name: "gpf_wfs_get_features",
                arguments: {
                    typename: "ADMINEXPRESS-COG.LATEST:commune",
                    cql_filter: "code_insee = '01001'",
                },
            },
        });

        expect(response.isError).toBe(true);
        const textContent = response.content[0];
        if (textContent.type !== "text") {
            throw new Error("expected text content");
        }
        expect(textContent.text).toMatch(/unrecognized/i);
        expect(textContent.text).toContain("cql_filter");
    });

    it("should build a POST request with query params and encoded body", async () => {
        const tool = new TestableGpfWfsGetFeaturesTool();
        tool.featureTypes[polygonFeatureType.id] = polygonFeatureType;
        tool.nextResponse = featureCollection;

        const response = await tool.toolCall({
            params: {
                name: "gpf_wfs_get_features",
                arguments: {
                    typename: "ADMINEXPRESS-COG.LATEST:commune",
                    limit: 7,
                    select: ["code_insee", "population"],
                    order_by: [{ property: "population", direction: "desc" }],
                    where: [{ property: "code_insee", operator: "eq", value: "01001" }],
                },
            },
        });

        expect(response.isError).toBeUndefined();
        expect(tool.requests).toHaveLength(1);
        expect(tool.requests[0].query.count).toEqual("7");
        expect(tool.requests[0].query.propertyName).toEqual("code_insee,population");
        expect(tool.requests[0].query.sortBy).toEqual("population D");
        expect(tool.requests[0].body).toContain("cql_filter=");
    });

    it("should keep hits independent from limit and omit propertyName", async () => {
        const tool = new TestableGpfWfsGetFeaturesTool();
        tool.featureTypes[polygonFeatureType.id] = polygonFeatureType;
        tool.nextResponse = { numberMatched: 321, totalFeatures: 999 };

        const response = await tool.toolCall({
            params: {
                name: "gpf_wfs_get_features",
                arguments: {
                    typename: "ADMINEXPRESS-COG.LATEST:commune",
                    result_type: "hits",
                    limit: 999,
                    select: ["code_insee"],
                },
            },
        });

        expect(response.isError).toBeUndefined();
        expect(tool.requests[0].query.count).toEqual("1");
        expect(tool.requests[0].query.propertyName).toBeUndefined();
        const textContent = response.content[0];
        if (textContent.type !== "text") {
            throw new Error("expected text content");
        }
        expect(JSON.parse(textContent.text)).toEqual(321);
    });

    it("should fall back to totalFeatures when numberMatched is absent", async () => {
        const tool = new TestableGpfWfsGetFeaturesTool();
        tool.featureTypes[polygonFeatureType.id] = polygonFeatureType;
        tool.nextResponse = { totalFeatures: 321 };

        const response = await tool.toolCall({
            params: {
                name: "gpf_wfs_get_features",
                arguments: {
                    typename: "ADMINEXPRESS-COG.LATEST:commune",
                    result_type: "hits",
                },
            },
        });

        expect(response.isError).toBeUndefined();
        const textContent = response.content[0];
        if (textContent.type !== "text") {
            throw new Error("expected text content");
        }
        expect(JSON.parse(textContent.text)).toEqual(321);
    });

    it("should fail clearly when numberMatched is unknown", async () => {
        const tool = new TestableGpfWfsGetFeaturesTool();
        tool.featureTypes[polygonFeatureType.id] = polygonFeatureType;
        tool.nextResponse = { numberMatched: "unknown" };

        const response = await tool.toolCall({
            params: {
                name: "gpf_wfs_get_features",
                arguments: {
                    typename: "ADMINEXPRESS-COG.LATEST:commune",
                    result_type: "hits",
                },
            },
        });

        expect(response.isError).toBe(true);
        const textContent = response.content[0];
        if (textContent.type !== "text") {
            throw new Error("expected text content");
        }
        expect(textContent.text).toContain("numberMatched=\"unknown\"");
    });

    it("should return feature_ref for non point layers and strip geometry", async () => {
        const tool = new TestableGpfWfsGetFeaturesTool();
        tool.featureTypes[polygonFeatureType.id] = polygonFeatureType;
        tool.nextResponse = {
            ...featureCollection,
            features: [
                {
                    type: "Feature",
                    id: "commune.1",
                    geometry: { type: "MultiPolygon", coordinates: [] },
                    geometry_name: "geometrie",
                    properties: { code_insee: "01001" },
                },
            ],
        };

        const response = await tool.toolCall({
            params: {
                name: "gpf_wfs_get_features",
                arguments: {
                    typename: "ADMINEXPRESS-COG.LATEST:commune",
                },
            },
        });

        expect(response.isError).toBeUndefined();
        const textContent = response.content[0];
        if (textContent.type !== "text") {
            throw new Error("expected text content");
        }
        const results = JSON.parse(textContent.text);
        expect(results.features[0].geometry).toBeNull();
        expect(results.features[0].feature_ref).toEqual({
            typename: "ADMINEXPRESS-COG.LATEST:commune",
            feature_id: "commune.1",
        });
        expect(results.features[0].geometry_name).toBeUndefined();
    });

    it("should strip point geometry too and keep feature_ref only", async () => {
        const tool = new TestableGpfWfsGetFeaturesTool();
        tool.featureTypes[pointFeatureType.id] = pointFeatureType;
        tool.nextResponse = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    id: "point_d_acces.1",
                    geometry: { type: "Point", coordinates: [2.3, 48.8] },
                    geometry_name: "geometrie",
                    properties: { cleabs: "id-1" },
                },
            ],
            totalFeatures: 1,
        };

        const response = await tool.toolCall({
            params: {
                name: "gpf_wfs_get_features",
                arguments: {
                    typename: "BDTOPO_V3:point_d_acces",
                    select: ["cleabs"],
                },
            },
        });

        expect(response.isError).toBeUndefined();
        expect(tool.requests[0].query.propertyName).toEqual("cleabs");
        const textContent = response.content[0];
        if (textContent.type !== "text") {
            throw new Error("expected text content");
        }
        const results = JSON.parse(textContent.text);
        expect(results.features[0].geometry).toBeNull();
        expect(results.features[0].feature_ref).toEqual({
            typename: "BDTOPO_V3:point_d_acces",
            feature_id: "point_d_acces.1",
        });
        expect(results.features[0].geometry_name).toBeUndefined();
    });

    it("should resolve intersects_feature from MultiPoint references", async () => {
        const tool = new TestableGpfWfsGetFeaturesTool();
        tool.featureTypes[multipointFeatureType.id] = multipointFeatureType;
        tool.nextResponse = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    id: "localisant.1",
                    geometry: { type: "MultiPoint", coordinates: [[2.3, 48.8], [2.4, 48.9]] },
                    properties: {},
                },
            ],
            totalFeatures: 1,
        };

        const response = await tool.toolCall({
            params: {
                name: "gpf_wfs_get_features",
                arguments: {
                    typename: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS:localisant",
                    spatial_operator: "intersects_feature",
                    intersects_feature_typename: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS:localisant",
                    intersects_feature_id: "localisant.1",
                    result_type: "request",
                },
            },
        });

        expect(response.isError).toBeUndefined();
        expect(tool.requests).toHaveLength(1);
        const textContent = response.content[0];
        if (textContent.type !== "text") {
            throw new Error("expected text content");
        }
        const request = JSON.parse(textContent.text);
        expect(request.body).toContain("MULTIPOINT");
    });

    it("should report missing reference features clearly for intersects_feature", async () => {
        const tool = new TestableGpfWfsGetFeaturesTool();
        tool.featureTypes[polygonFeatureType.id] = polygonFeatureType;
        tool.nextResponse = {
            type: "FeatureCollection",
            features: [],
            totalFeatures: 0,
        };

        const response = await tool.toolCall({
            params: {
                name: "gpf_wfs_get_features",
                arguments: {
                    typename: "ADMINEXPRESS-COG.LATEST:commune",
                    spatial_operator: "intersects_feature",
                    intersects_feature_typename: "ADMINEXPRESS-COG.LATEST:commune",
                    intersects_feature_id: "commune.404",
                },
            },
        });

        expect(response.isError).toBe(true);
        const textContent = response.content[0];
        if (textContent.type !== "text") {
            throw new Error("expected text content");
        }
        expect(textContent.text).toContain("est introuvable");
        expect(textContent.text).toContain("commune.404");
    });
});
