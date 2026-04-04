import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

export async function readMarkdownResource(importMetaUrl: string, filename: string): Promise<string> {
  const currentDir = dirname(fileURLToPath(importMetaUrl));
  const candidates = [
    join(currentDir, "content", filename),
    join(currentDir, "../../src/resources/content", filename),
  ];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf-8");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}
