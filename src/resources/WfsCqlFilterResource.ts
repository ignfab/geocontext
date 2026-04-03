import { MCPResource, ResourceContent } from "mcp-framework";
import { readMarkdownResource } from "./readMarkdownResource.js";

class WfsCqlFilterResource extends MCPResource {
  uri = "geocontext://wfs-cql-filter";
  name = "geocontext-wfs-cql-filter";
  description = "Aide-mémoire pour construire des cql_filter GeoServer utilisables avec les tools WFS.";
  mimeType = "text/markdown";
  protected title = "Cheatsheet cql_filter";

  async read(): Promise<ResourceContent[]> {
    const text = await readMarkdownResource(import.meta.url, "wfs-cql-filter.md");

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
