import { describe, it, expect } from "vitest";

import DistanceTool from "../../src/tools/DistanceTool";
import { validateStructuredContentAgainstOutputSchema } from "./helpers/outputSchema";
import { expectErrorText } from "./helpers/errorAssertions";

describe("Test DistanceTool", () => {
    const departure = { lon: 2.3522, lat: 48.8566 };
    const arrival = { lon: 2.2945, lat: 48.8584 };

    it("should publish an optional profile and a distance output schema", () => {
        const tool = new DistanceTool();
        expect(tool.toolDefinition.title).toEqual("Distance entre deux points");
        expect(tool.toolDefinition.inputSchema.required).not.toContain("profile");
        expect(tool.toolDefinition.inputSchema.properties?.profile).toMatchObject({
            enum: ["direct", "vincenty"],
            default: "direct",
        });
        expect(tool.toolDefinition.outputSchema).toBeDefined();
    });

    it.each([undefined, "direct", "vincenty"])("should return a structured distance for profile %s", async (profile) => {
        const tool = new DistanceTool();
        const response = await tool.toolCall({
            params: {
                name: "distance",
                arguments: { departure, arrival, ...(profile && { profile }) },
            },
        });

        expect(response.isError).toBeUndefined();
        expect(response.structuredContent).toMatchObject({ distance: expect.any(Number) });
        expect((response.structuredContent as { distance: number }).distance).toBeGreaterThan(0);
        expect(response.content[0]).toMatchObject({ type: "text" });
        expect(validateStructuredContentAgainstOutputSchema(
            tool.toolDefinition.outputSchema,
            response.structuredContent,
        )).toBeNull();
    });

    it("should reject invalid coordinates at the tool boundary", async () => {
        const tool = new DistanceTool();
        const response = await tool.toolCall({
            params: {
                name: "distance",
                arguments: { departure: { lon: 600, lat: 48.8566 }, arrival },
            },
        });

        expect(expectErrorText(response)).toContain("departure.lon: La valeur doit être au plus 180.");
    });
});
