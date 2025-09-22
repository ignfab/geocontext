import { MCPServer } from "mcp-framework";

const mcpServer = new MCPServer({
  // transport: {
  //   type: "http-stream",
  //   options: {
  //     port: 8080,
  //     cors: {
  //       allowOrigin: "*"
  //     }
  //   }
  // }
});

await mcpServer.start();
