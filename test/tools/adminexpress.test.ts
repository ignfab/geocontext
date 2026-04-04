import AdminexpressTool from "../../src/tools/AdminexpressTool";
import { mairieLoray } from "../samples";

const adminexpressResults = [
    {
        type: "commune",
        id: "commune.1",
        bbox: [6.4, 47.1, 6.5, 47.2],
        nom_officiel: "Loray",
        nom_officiel_en_majuscules: "LORAY",
        code_insee_du_departement: "25",
        code_insee_de_la_region: "27",
        code_siren: "212503494",
    },
    {
        type: "departement",
        id: "departement.1",
        bbox: [6.4, 47.1, 6.5, 47.2],
        nom_officiel: "Doubs",
        nom_officiel_en_majuscules: "DOUBS",
        code_insee: "25",
        code_insee_de_la_region: "27",
        code_siren: "222500019",
    },
];

describe("Test AdminexpressTool",() => {
    class TestableAdminexpressTool extends AdminexpressTool {
        async execute() {
            return {
                results: adminexpressResults,
            };
        }
    }

    it("should expose an enriched MCP definition", () => {
        const tool = new AdminexpressTool();
        expect(tool.toolDefinition.title).toEqual("Unités administratives");
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
        const c = mairieLoray.coordinates;
        const tool = new TestableAdminexpressTool();
        const response = await tool.toolCall({
            params: {
                name: "adminexpress",
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
        const payload = JSON.parse(textContent.text);
        const results = payload.results;
        expect(results).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: "commune",
                nom_officiel: "Loray",
            }),
            expect.objectContaining({
                type: "departement",
                nom_officiel: "Doubs",
            }),
        ]));
        expect(response.structuredContent).toMatchObject({
            results: expect.arrayContaining([
                expect.objectContaining({
                    type: "commune",
                    nom_officiel: "Loray",
                }),
                expect.objectContaining({
                    type: "departement",
                    nom_officiel: "Doubs",
                }),
            ]),
        });
        expect(payload).toMatchObject(response.structuredContent as Record<string, unknown>);
    });

    it("should return isError=true for invalid input", async () => {
        const tool = new AdminexpressTool();
        const response = await tool.toolCall({
            params: {
                name: "adminexpress",
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
