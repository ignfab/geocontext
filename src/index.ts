import { MCPServer } from "mcp-framework";

import { dirname } from "path";
import { fileURLToPath } from "url";

// Get the directory of the current module (dist directory)
const __dirname = dirname(fileURLToPath(import.meta.url));

const mcpServer = new MCPServer({
  basePath: __dirname
});

await mcpServer.start();
