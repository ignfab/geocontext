import { describe, expect, afterEach, beforeEach, it } from "vitest";
import { FeatureTypeNotFoundError, WfsSchemaStore, wfsSchemaStore, loadMiniSearchOptionsFromEnv } from "../../src/wfs/catalog";
import { resetEnv } from "../../src/config/env.js";

const GPF_WFS_MINISEARCH_OPTIONS_ENV = "GPF_WFS_MINISEARCH_OPTIONS";

describe("Test WfsSchemaStore",() => {
    let previousMiniSearchOptionsEnv: string | undefined;

    beforeEach(() => {
        previousMiniSearchOptionsEnv = process.env[GPF_WFS_MINISEARCH_OPTIONS_ENV];
        delete process.env[GPF_WFS_MINISEARCH_OPTIONS_ENV];
        resetEnv();
    });

    afterEach(() => {
        if (previousMiniSearchOptionsEnv === undefined) {
            delete process.env[GPF_WFS_MINISEARCH_OPTIONS_ENV];
        } else {
            process.env[GPF_WFS_MINISEARCH_OPTIONS_ENV] = previousMiniSearchOptionsEnv;
        }
        resetEnv();
    });

    describe("loadMiniSearchOptionsFromEnv", () => {
        it("should return undefined when env var is not set", () => {
            expect(loadMiniSearchOptionsFromEnv()).toBeUndefined();
        });

        it("should parse valid JSON options", () => {
            process.env[GPF_WFS_MINISEARCH_OPTIONS_ENV] = JSON.stringify({
                fields: ["title", "identifierTokens"],
                combineWith: "OR",
                fuzzy: 0.05,
                boost: {
                    title: 4,
                    name: 5,
                },
            });

            expect(loadMiniSearchOptionsFromEnv()).toEqual({
                fields: ["title", "identifierTokens"],
                combineWith: "OR",
                fuzzy: 0.05,
                boost: {
                    title: 4,
                    name: 5,
                },
            });
        });

        it("should throw on invalid JSON", () => {
            process.env[GPF_WFS_MINISEARCH_OPTIONS_ENV] = '{"fuzzy":0.1';
            expect(() => loadMiniSearchOptionsFromEnv()).toThrow("GPF_WFS_MINISEARCH_OPTIONS");
        });

        it("should throw on invalid option keys", () => {
            process.env[GPF_WFS_MINISEARCH_OPTIONS_ENV] = JSON.stringify({
                unsupported: 1,
            });
            expect(() => loadMiniSearchOptionsFromEnv()).toThrow("Unrecognized key(s) in object: 'unsupported'");
        });

        it("should throw on invalid option value types", () => {
            process.env[GPF_WFS_MINISEARCH_OPTIONS_ENV] = JSON.stringify({
                boost: {
                    title: "4",
                },
            });
            expect(() => loadMiniSearchOptionsFromEnv()).toThrow("boost.title: Expected number, received string");
        });

        it("should throw on invalid fields value", () => {
            process.env[GPF_WFS_MINISEARCH_OPTIONS_ENV] = JSON.stringify({
                fields: ["title", "not_a_field"],
            });
            expect(() => loadMiniSearchOptionsFromEnv()).toThrow("fields.1:");
        });

        it("should throw on invalid combineWith value", () => {
            process.env[GPF_WFS_MINISEARCH_OPTIONS_ENV] = JSON.stringify({
                combineWith: "XOR",
            });
            expect(() => loadMiniSearchOptionsFromEnv()).toThrow("combineWith:");
        });
    });

    describe("searchFeatureTypesWithScores",() => {
        it("should find BDTOPO_V3:batiment for 'bâtiments bdtopo'", async () => {
            const featureTypes = await wfsSchemaStore.searchFeatureTypesWithScores("bâtiments bdtopo");
            expect(featureTypes).toBeDefined();
            expect(featureTypes.length).toBeGreaterThan(0);
            const featureTypeNames= featureTypes.map((featureType)=>featureType.id);
            expect(featureTypeNames).toContain("BDTOPO_V3:batiment");
        });
        it("should find BDTOPO_V3:departement and ADMINEXPRESS-COG.LATEST:departement for 'départements'", async () => {
            const featureTypes = await wfsSchemaStore.searchFeatureTypesWithScores("départements");
            expect(featureTypes).toBeDefined();
            expect(featureTypes.length).toBeGreaterThan(0);
            const featureTypeNames= featureTypes.map((featureType)=>featureType.id);
            expect(featureTypeNames).toContain("BDTOPO_V3:departement");
            expect(featureTypeNames).toContain("ADMINEXPRESS-COG.LATEST:departement");
        });

        it("should allow overriding search tuning in WfsSchemaStore constructor", async () => {
            const tuned = new WfsSchemaStore({
                miniSearch: {
                    fields: ["title", "identifierTokens"],
                    combineWith: "OR",
                    fuzzy: 0.1,
                    boost: { title: 4.0 },
                }
            });
            const featureTypes = await tuned.searchFeatureTypesWithScores("bâtiments bdtopo");
            expect(featureTypes).toBeDefined();
            expect(featureTypes.length).toBeGreaterThan(0);
            const featureTypeNames= featureTypes.map((featureType)=>featureType.id);
            expect(featureTypeNames).toContain("BDTOPO_V3:batiment");
        });
        it("should return scored results for 'bâtiments bdtopo'", async () => {
            const featureTypes = await wfsSchemaStore.searchFeatureTypesWithScores("bâtiments bdtopo");
            expect(featureTypes).toBeDefined();
            expect(featureTypes.length).toBeGreaterThan(0);

            const batimentResult = featureTypes.find((featureType) => featureType.id === "BDTOPO_V3:batiment");
            expect(batimentResult).toBeDefined();
            expect(batimentResult?.score).toEqual(expect.any(Number));
        });
    });

    describe("getFeatureType",() => {
        it("should return the feature type with BDTOPO_V3:batiment", async () => {
            const featureType = await wfsSchemaStore.getFeatureType("BDTOPO_V3:batiment");
            expect(featureType).toBeDefined();
            expect(featureType?.title).toEqual("Bâtiment");
        });

        it("should throw an error if the feature type does not exist", async () => {
            await expect(wfsSchemaStore.getFeatureType("BDTOPO_V3:not_found")).rejects.toThrow(FeatureTypeNotFoundError);
        });
    });

});
