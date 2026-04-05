import ShowIgnMapTool from "../../src/tools/ShowIgnMapTool";

describe("Test ShowIgnMapTool", () => {
    it("should expose an MCP app definition", () => {
        const tool = new ShowIgnMapTool();

        expect(tool.toolDefinition.title).toEqual("Carte IGN");
        expect(tool.toolDefinition.inputSchema.properties?.geojsonUrl).toMatchObject({
            type: "string",
        });
        expect(tool.toolDefinition._meta?.ui).toMatchObject({
            resourceUri: "ui://show-ign-map/view",
        });
        expect(tool.toolDefinition.outputSchema).toBeDefined();
    });

    it("should accept a valid data.geopf.fr URL", async () => {
        const tool = new ShowIgnMapTool();
        const response = await tool.toolCall({
            params: {
                name: "show_ign_map",
                arguments: {
                    title: "Parcelles",
                    geojsonUrl: "https://data.geopf.fr/wfs?service=WFS&request=GetFeature&typeName=CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle&outputFormat=application/json",
                },
            },
        });

        expect(response.isError).toBeUndefined();
        expect(response.structuredContent).toMatchObject({
            title: "Parcelles",
            geojsonUrl: "https://data.geopf.fr/wfs?service=WFS&request=GetFeature&typeName=CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle&outputFormat=application/json",
            basemapLayer: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2",
        });
    });

    it("should accept an empty overlay", async () => {
        const tool = new ShowIgnMapTool();
        const response = await tool.toolCall({
            params: {
                name: "show_ign_map",
                arguments: {
                    title: "Sans overlay",
                },
            },
        });

        expect(response.isError).toBeUndefined();
        expect(response.structuredContent).toMatchObject({
            title: "Sans overlay",
            basemapLayer: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2",
        });
    });

    it("should reject non-https URLs", async () => {
        const tool = new ShowIgnMapTool();
        const response = await tool.toolCall({
            params: {
                name: "show_ign_map",
                arguments: {
                    geojsonUrl: "http://data.geopf.fr/wfs?service=WFS",
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
        expect(textContent.text).toContain("https://data.geopf.fr");
    });

    it("should reject other hosts", async () => {
        const tool = new ShowIgnMapTool();
        const response = await tool.toolCall({
            params: {
                name: "show_ign_map",
                arguments: {
                    geojsonUrl: "https://example.com/data.geojson",
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
        expect(textContent.text).toContain("https://data.geopf.fr");
    });
});
