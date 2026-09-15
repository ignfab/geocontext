/**
 * Integration test: verify that the geocontext MCP server exposes
 * all expected tools with valid schemas and fails fast when tool
 * module preflight detects import failures.
 */

import { describe, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { listTools } from "../helpers/mcp-client.js";
import { withMcpServer } from "../helpers/level1-fixtures.js";
import { EXPECTED_TOOL_NAMES } from "../samples.js";

const STARTUP_TIMEOUT_MS = 15_000;

async function runServerAndCaptureStderr(envOverrides: Record<string, string>): Promise<{ exitCode: number | null; stderr: string }> {
  return new Promise((resolveResult, reject) => {
    const child: ChildProcess = spawn(
      process.execPath,
      [resolve(process.cwd(), process.env.GEOCONTEXT_SERVER_PATH ?? "dist/index.js")],
      {
        env: {
          ...process.env,
          LOG_LEVEL: process.env.GEOCONTEXT_LOG_LEVEL ?? "error",
          NODE_USE_ENV_PROXY: "1",
          ...envOverrides,
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );

    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Server did not exit within ${STARTUP_TIMEOUT_MS}ms`));
    }, STARTUP_TIMEOUT_MS);

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      resolveResult({ exitCode: code, stderr });
    });
  });
}

async function createServerBundleWithBrokenTool(): Promise<{ serverPath: string; brokenModuleName: string; cleanup: () => Promise<void> }> {
  const sourceDistDir = resolve(process.cwd(), "dist");
  const sourcePackageJson = resolve(process.cwd(), "package.json");
  const tempRoot = resolve(process.cwd(), "tmp");
  await mkdir(tempRoot, { recursive: true });
  const tempDir = await mkdtemp(join(tempRoot, "geocontext-tools-discovery-"));
  const copiedDistDir = join(tempDir, "dist");
  const copiedPackageJson = join(tempDir, "package.json");

  await cp(sourceDistDir, copiedDistDir, { recursive: true });
  await cp(sourcePackageJson, copiedPackageJson);

  const toolsDir = join(copiedDistDir, "tools");
  const toolEntries = await readdir(toolsDir);
  const brokenModuleName = toolEntries.find((name) => name.endsWith("Tool.js") && name !== "BaseTool.js");
  if (!brokenModuleName) {
    throw new Error("No tool module found to inject an import failure.");
  }

  const brokenModulePath = join(toolsDir, brokenModuleName);
  await writeFile(
    brokenModulePath,
    "throw new Error('tools-discovery injected import failure');\n",
    "utf8",
  );

  return {
    serverPath: join(copiedDistDir, "index.js"),
    brokenModuleName,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

describe("Tools Discovery", () => {
  const { getHandle } = withMcpServer();

  it("should expose all expected tools", async () => {
    const tools = await listTools(getHandle().client);
    const toolNames = tools.map((t) => t.name);

    for (const expected of EXPECTED_TOOL_NAMES) {
      expect(toolNames).toContain(expected);
    }
  });

  it("should expose exactly the expected number of tools", async () => {
    const tools = await listTools(getHandle().client);
    expect(tools).toHaveLength(EXPECTED_TOOL_NAMES.length);
  });

  it("each tool should have a valid inputSchema", async () => {
    const tools = await listTools(getHandle().client);

    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  it("each tool should have a description", async () => {
    const tools = await listTools(getHandle().client);

    for (const tool of tools) {
      expect(tool.description).toBeDefined();
      expect(tool.description!.length).toBeGreaterThan(0);
    }
  });

  it("fails startup with tool preflight details when a tool module cannot be imported", async () => {
    const { serverPath, brokenModuleName, cleanup } = await createServerBundleWithBrokenTool();
    const previousServerPath = process.env.GEOCONTEXT_SERVER_PATH;

    try {
      process.env.GEOCONTEXT_SERVER_PATH = serverPath;

      const { exitCode, stderr } = await runServerAndCaptureStderr({});

      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("Tool preflight failed (");
      expect(stderr).toContain("Failed modules:");
      expect(stderr).toContain(brokenModuleName);
      expect(stderr).not.toContain("Invalid environment configuration:");
    } finally {
      if (previousServerPath === undefined) {
        delete process.env.GEOCONTEXT_SERVER_PATH;
      } else {
        process.env.GEOCONTEXT_SERVER_PATH = previousServerPath;
      }
      await cleanup();
    }
  });
});
