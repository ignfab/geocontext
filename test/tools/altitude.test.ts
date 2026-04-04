import AltitudeTool from "../../src/tools/AltitudeTool";
import { paris } from "../samples";

describe("Test AltitudeTool",() => {
    class TestableAltitudeTool extends AltitudeTool {
        async execute() {
            return {
                result: {
                    lon: paris.coordinates[0],
                    lat: paris.coordinates[1],
                    altitude: 34.78,
                    accuracy: "Variable suivant la source de mesure",
                },
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
            result: {
                lon: c[0],
                lat: c[1],
            },
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
