/**
 * Configuration for Level 2 (Agent E2E) integration tests.
 *
 * Equivalent of the Python config.py from geocontext-test.
 *
 * Environment variables:
 * - MODEL_NAME: model identifier (default: "anthropic:claude-haiku-4-5")
 * - Provider key depending on MODEL_NAME prefix (ex: ANTHROPIC_API_KEY, GOOGLE_API_KEY, OPENAI_API_KEY)
 * - HTTPS_PROXY / HTTP_PROXY: proxy used for model provider calls
 */

import { initChatModel } from "langchain";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { INTEGRATION_CONFIG, MILLISECONDS, PROXY_ENV_KEYS } from "./shared.js";
import { setGlobalDispatcher, ProxyAgent } from "undici";

let proxyConfigured = false;

/** Model name for the LLM */
export const MODEL_NAME = process.env.MODEL_NAME ?? "anthropic:claude-haiku-4-5";

function requiredApiKeyEnvFromModelName(modelName: string): string | undefined {
  const [provider] = modelName.split(":", 1);

  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  if (provider === "google_genai" || provider === "google") return "GOOGLE_API_KEY";
  if (provider === "openai") return "OPENAI_API_KEY";
  if (provider === "mistralai" || provider === "mistral") return "MISTRAL_API_KEY";

  return undefined;
}

function configureModelProxy() {
  if (proxyConfigured) {
    return;
  }

  const proxyUrl = PROXY_ENV_KEYS
    .map((key) => process.env[key])
    .find((value) => Boolean(value));

  if (proxyUrl) {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
  }

  proxyConfigured = true;
}

/** System prompt for the agent */
export const SYSTEM_PROMPT = [
  "Use the tools to answer question about geospatial data.",
].join("\n");

/** Timeout for agent E2E tests (2 minutes) */
export const E2E_TIMEOUT = 120 * MILLISECONDS;

/** Timeout for server connection */
export const CONNECT_TIMEOUT = 30 * MILLISECONDS;

export const MODEL_PROVIDER_API_KEY_ENV = requiredApiKeyEnvFromModelName(MODEL_NAME);
export const HAS_MODEL_PROVIDER_API_KEY = MODEL_PROVIDER_API_KEY_ENV
  ? Boolean(process.env[MODEL_PROVIDER_API_KEY_ENV])
  : true;

/**
 * Create a provider-agnostic LangChain chat model instance.
 */
export async function createModel() {
  if (!HAS_MODEL_PROVIDER_API_KEY) {
    throw new Error(
      `${MODEL_PROVIDER_API_KEY_ENV} is required to run level2-agent integration tests with MODEL_NAME=\"${MODEL_NAME}\".`,
    );
  }

  configureModelProxy();

  return initChatModel(MODEL_NAME, {
    temperature: 0,
  });
}

/**
 * Create a MultiServerMCPClient connected to the geocontext server via stdio.
 *
 * Uses the local built geocontext server entrypoint.
 */
export function createMcpClient(): MultiServerMCPClient {
  return new MultiServerMCPClient({
    geocontext: {
      transport: "stdio",
      command: INTEGRATION_CONFIG.serverCommand,
      args: [...INTEGRATION_CONFIG.serverArgs],
      env: INTEGRATION_CONFIG.serverEnv(),
    },
  });
}
