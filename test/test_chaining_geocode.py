import pytest
import re

from langchain.agents import create_agent
from langchain_core.callbacks.base import BaseCallbackHandler

USER_INPUT = "Quelle est l'altitude de la mairie de Chamonix?"

class ToolCallTracker(BaseCallbackHandler):
    """Callback handler to track tool calls during agent execution."""
    def __init__(self):
        self.tool_calls = []
        
    def on_tool_start(self, serialized, input_str, **kwargs):
        tool_name = serialized.get("name", "unknown")
        self.tool_calls.append({
            "name": tool_name,
            "input": input_str,
            "type": "start"
        })
        print(f"[TOOL CALL] Starting tool: {tool_name} with input: {input_str}")

    def on_tool_end(self, output, **kwargs):
        self.tool_calls.append({
            "output": output,
            "type": "end"
        })
        print(f"[TOOL RESULT] Tool output: {output}")

@pytest.mark.asyncio
async def test_chaining_geocode_altitude(mcp_tools, model):
    geocode_tool = next((t for t in mcp_tools if t.name == "geocode"), None)
    assert geocode_tool is not None, "Tool 'geocode' not found"

    altitude_tool = next((t for t in mcp_tools if t.name == "altitude"), None)
    assert altitude_tool is not None, "Tool 'altitude' not found"

    agent = create_agent(
        model=model,
        tools=mcp_tools, 
        system_prompt="You are a helpful assistant for geospatial data. You can use the following tools to answer questions about geospatial data: {tools}. Always use these tools when relevant to answer the user's question."
    )
    assert agent is not None

    # Create tool call tracker
    tracker = ToolCallTracker()
    
    # Invoke agent with callback handler to track tool calls
    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": USER_INPUT}]},
        config={"callbacks": [tracker]}
    )

    # Verify that geocode tool was called
    geocode_calls = [call for call in tracker.tool_calls if call.get("name") == "geocode" and call.get("type") == "start"]
    assert len(geocode_calls) > 0, "geocode tool was not called"
    print(f"✓ geocode tool was called {len(geocode_calls)} time(s)")

    # Verify that altitude tool was called
    altitude_calls = [call for call in tracker.tool_calls if call.get("name") == "altitude" and call.get("type") == "start"]
    assert len(altitude_calls) > 0, "altitude tool was not called"
    print(f"✓ altitude tool was called {len(altitude_calls)} time(s)")

    last_message = result["messages"][-1]
    message_text = str(last_message).replace("\u202f", " ").replace("\xa0", " ")

    print(last_message.pretty_print())
    keywords = ["chamonix", "mont-blanc", "mont blanc"]
    assert any(k in message_text.lower() for k in keywords), \
        f"None of {keywords} found in response"
    # ensure that the altitude is around 1036m, allowing for some variation in the response format
    assert re.search(r"1[\s\u202f\xa0.,]*0[\s]*3[\s]*6", message_text), \
        "Altitude ~1036m not found in response"
