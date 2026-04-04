import { MCPResource, ResourceContent } from "mcp-framework";
import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

class WfsCqlFilterResource extends MCPResource {
  uri = "geocontext://wfs-cql-filter";
  name = "geocontext-wfs-cql-filter";
  description = "Aide-mémoire pour construire des cql_filter GeoServer utilisables avec les tools WFS.";
  mimeType = "text/markdown";
  protected title = "Cheatsheet cql_filter";

  async read(): Promise<ResourceContent[]> {
    const text = await readFile(
      join(dirname(fileURLToPath(import.meta.url)), "content", "wfs-cql-filter.md"),
      "utf-8"
    );

    return [
      {
        uri: this.uri,
        mimeType: this.mimeType,
        text,
      },
    ];
  }
}

export default WfsCqlFilterResource;
