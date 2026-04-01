import { FeatureTypeNotFoundError, WfsClient, wfsClient, loadSearchOptionsFromEnv } from "../../src/gpf/wfs";

const GPF_WFS_SEARCH_OPTIONS_ENV = "GPF_WFS_SEARCH_OPTIONS";

describe("Test WfsClient",() => {
    let previousSearchOptionsEnv: string | undefined;

    beforeEach(() => {
        previousSearchOptionsEnv = process.env[GPF_WFS_SEARCH_OPTIONS_ENV];
        delete process.env[GPF_WFS_SEARCH_OPTIONS_ENV];
    });

    afterEach(() => {
        if (previousSearchOptionsEnv === undefined) {
            delete process.env[GPF_WFS_SEARCH_OPTIONS_ENV];
            return;
        }
        process.env[GPF_WFS_SEARCH_OPTIONS_ENV] = previousSearchOptionsEnv;
    });

    describe("loadSearchOptionsFromEnv", () => {
        it("should return undefined when env var is not set", () => {
            expect(loadSearchOptionsFromEnv()).toBeUndefined();
        });

        it("should parse valid JSON options", () => {
            process.env[GPF_WFS_SEARCH_OPTIONS_ENV] = JSON.stringify({
                fuzzy: 0.05,
                boost: {
                    title: 4,
                    name: 5,
                },
            });

            expect(loadSearchOptionsFromEnv()).toEqual({
                fuzzy: 0.05,
                boost: {
                    title: 4,
                    name: 5,
                },
            });
        });

        it("should throw on invalid JSON", () => {
            process.env[GPF_WFS_SEARCH_OPTIONS_ENV] = '{"fuzzy":0.1';
            expect(() => loadSearchOptionsFromEnv()).toThrow("Invalid GPF_WFS_SEARCH_OPTIONS");
        });

        it("should throw on invalid option keys", () => {
            process.env[GPF_WFS_SEARCH_OPTIONS_ENV] = JSON.stringify({
                unsupported: 1,
            });
            expect(() => loadSearchOptionsFromEnv()).toThrow("unexpected key 'unsupported'");
        });

        it("should throw on invalid option value types", () => {
            process.env[GPF_WFS_SEARCH_OPTIONS_ENV] = JSON.stringify({
                boost: {
                    title: "4",
                },
            });
            expect(() => loadSearchOptionsFromEnv()).toThrow("expected 'boost.title' to be a finite number");
        });
    });

    describe("getFeatureTypes",() => {
        it("should return the list of feature types with BDTOPO_V3:batiment", async () => {
            const featureTypes = await wfsClient.getFeatureTypes();
            expect(featureTypes).toBeDefined();
            expect(featureTypes.length).toBeGreaterThan(0);

            const featureTypeNames= featureTypes.map((featureType)=>featureType.id);
            expect(featureTypeNames).toContain("BDTOPO_V3:batiment");
        });
    });

    describe("searchFeatureTypes",() => {
        it("should find BDTOPO_V3:batiment for 'bâtiments bdtopo'", async () => {
            const featureTypes = await wfsClient.searchFeatureTypes("bâtiments bdtopo");
            expect(featureTypes).toBeDefined();
            expect(featureTypes.length).toBeGreaterThan(0);
            const featureTypeNames= featureTypes.map((featureType)=>featureType.id);
            expect(featureTypeNames).toContain("BDTOPO_V3:batiment");
        });
        it("should find BDTOPO_V3:departement and ADMINEXPRESS-COG.LATEST:departement for 'départements'", async () => {
            const featureTypes = await wfsClient.searchFeatureTypes("départements");
            expect(featureTypes).toBeDefined();
            expect(featureTypes.length).toBeGreaterThan(0);
            const featureTypeNames= featureTypes.map((featureType)=>featureType.id);
            expect(featureTypeNames).toContain("BDTOPO_V3:departement");
            expect(featureTypeNames).toContain("ADMINEXPRESS-COG.LATEST:departement");
        });

        it("should allow overriding search tuning in WfsClient constructor", async () => {
            const tuned = new WfsClient(undefined, {
                search: {
                    fuzzy: 0.1,
                    boost: { title: 4.0 },
                }
            });
            const featureTypes = await tuned.searchFeatureTypes("bâtiments bdtopo");
            expect(featureTypes).toBeDefined();
            expect(featureTypes.length).toBeGreaterThan(0);
            const featureTypeNames= featureTypes.map((featureType)=>featureType.id);
            expect(featureTypeNames).toContain("BDTOPO_V3:batiment");
        });

    });

    describe("getFeatureType",() => {
        it("should return the feature type with BDTOPO_V3:batiment", async () => {
            const featureType = await wfsClient.getFeatureType("BDTOPO_V3:batiment");
            expect(featureType).toBeDefined();
            expect(featureType?.id).toEqual("BDTOPO_V3:batiment");
        });

        it("should throw an error if the feature type does not exist", async () => {
            await expect(wfsClient.getFeatureType("BDTOPO_V3:not_found")).rejects.toThrow(FeatureTypeNotFoundError);
        });
    });

});
