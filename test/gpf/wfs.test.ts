import { FeatureTypeNotFoundError, wfsClient } from "../../src/gpf/wfs";

describe("Test WfsClient",() => {
    describe("getFeatureTypes",() => {
        it("should return the list of feature types with BDTOPO_V3:batiment", async () => {
            const featureTypes = await wfsClient.getFeatureTypes();
            expect(featureTypes).toBeDefined();
            expect(featureTypes.length).toBeGreaterThan(0);

            const featureTypeNames= featureTypes.map((featureType)=>featureType.name);
            expect(featureTypeNames).toContain("BDTOPO_V3:batiment");
        });
    });

    describe("getFeatureType",() => {
        it("should return the feature type with BDTOPO_V3:batiment", async () => {
            const featureType = await wfsClient.getFeatureType("BDTOPO_V3:batiment");
            expect(featureType).toBeDefined();
            expect(featureType?.name).toEqual("BDTOPO_V3:batiment");
        });

        it("should throw an error if the feature type does not exist", async () => {
            await expect(wfsClient.getFeatureType("BDTOPO_V3:not_found")).rejects.toThrow(FeatureTypeNotFoundError);
        });
    });

});
