import AltitudeTool from "../../src/tools/AltitudeTool";
import {getAltitudeByLocation} from "../../src/gpf/altitude.js";
import { paris } from "../samples";

const parisElevationResponse = {
    elevations: [
        {
            z: 34.78,
            acc: "Variable suivant la source de mesure",
        },
    ],
};

const voidElevationResponse = {
    elevations: [
        {
            z: -99999,
            acc: "Variable suivant la source de mesure",
        },
    ],
};

describe("Test getAltitudeByLocation",() => {
    it("should return ~34.8 meters for Paris", async () => {
        const c = paris.coordinates;
        const result = await getAltitudeByLocation(c[0],c[1], async () => parisElevationResponse);
        expect(result.lat).toBeCloseTo(48.866667);
        expect(result.lon).toBeCloseTo(2.333333);
        expect(result.altitude).toBeCloseTo(34.8,1);
        expect(result.accuracy).toEqual("Variable suivant la source de mesure");
    });


    it("should throw return null for 0.0,0.0", async () => {
        const result = await getAltitudeByLocation(0.0,0.0, async () => voidElevationResponse);
        expect(result.altitude).toEqual(-99999);
        expect(result.accuracy).toEqual("Variable suivant la source de mesure");
    });


    it("should throw for 600.0,600.0", async () => {
        await expect(getAltitudeByLocation(600.0,600.0, async () => ({ elevations: [] }))).rejects.toThrow(
            "No elevation data returned by the altitude service"
        );
    });

});

describe("Test AltitudeTool",() => {
    class TestableAltitudeTool extends AltitudeTool {
        async execute() {
            return {
                result: await getAltitudeByLocation(paris.coordinates[0], paris.coordinates[1], async () => parisElevationResponse),
            };
        }
    }

    it("should expose an enriched MCP definition", () => {
        const tool = new AltitudeTool();
        expect(tool.toolDefinition.title).toEqual("Altitude d’une position");
        expect(tool.toolDefinition.inputSchema.properties?.lon).toMatchObject({
            type: "number",
            minimum: -180,
            maximum: 180,
        });
        expect(tool.toolDefinition.inputSchema.properties?.lat).toMatchObject({
            type: "number",
            minimum: -90,
            maximum: 90,
        });
        expect(tool.toolDefinition.outputSchema).toBeDefined();
    });

    it("should return both text content and structuredContent", async () => {
        const c = paris.coordinates;
        const tool = new TestableAltitudeTool();
        const response = await tool.toolCall({
            params: {
                name: "altitude",
                arguments: {
                    lon: c[0],
                    lat: c[1],
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
        expect(JSON.parse(textContent.text)).toMatchObject({
            lon: c[0],
            lat: c[1],
        });
        expect(response.structuredContent).toBeDefined();
        expect(response.structuredContent).toMatchObject({
            result: {
                lon: c[0],
                lat: c[1],
            },
        });
    });

    it("should reject out-of-range coordinates at the tool boundary", async () => {
        const tool = new AltitudeTool();
        const response = await tool.toolCall({
            params: {
                name: "altitude",
                arguments: {
                    lon: 600,
                    lat: 600,
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
        expect(textContent.text).toContain("Number must be less than or equal to 180");
    });
});
