import { createAgent } from "langchain";
import { HumanMessage } from "@langchain/core/messages";
import type { Callbacks } from "@langchain/core/callbacks/manager";
import { createModel } from "../config/level2-agent.js";

type AgentTools = Parameters<typeof createAgent>[0]["tools"];
type AgentInstance = ReturnType<typeof createAgent>;
type AgentInvokeResult = Awaited<ReturnType<AgentInstance["invoke"]>>;
type AgentInvokeInput = Parameters<AgentInstance["invoke"]>[0];

/**
 * Defines options for invoking a LangChain agent in integration E2E tests.
 */
export interface InvokeAgentOptions {
  /** End-user question sent as a single human message. */
  userInput: string;
  /** Toolset exposed to the agent for this test scenario. */
  tools: AgentTools;
  /** Optional system prompt to steer behavior. */
  systemPrompt?: string;
  /** Optional callback handlers (for example tool call tracking). */
  callbacks?: Callbacks;
}

/**
 * Builds a model-backed agent and invokes it with one user message.
 *
 * This helper centralizes the repeated `createModel` + `createAgent` + `invoke`
 * sequence used by level2-agent tests.
 *
 * @param options Invocation options (user input, tools, optional prompt/callbacks).
 * @returns Agent invoke result containing the conversation messages.
 */
export async function invokeAgent(options: InvokeAgentOptions): Promise<AgentInvokeResult> {
  const model = await createModel();
  const agent = createAgent({
    model,
    tools: options.tools,
    systemPrompt: options.systemPrompt,
  });

  // LangChain's current createAgent typing rejects the message object literal
  // shape at the call site, even though the runtime API accepts it.
  const input = {
    messages: [new HumanMessage(options.userInput)],
  } as AgentInvokeInput;

  if (options.callbacks) {
    return agent.invoke(input, { callbacks: options.callbacks });
  }

  return agent.invoke(input);
}
