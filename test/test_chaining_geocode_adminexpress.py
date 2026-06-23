import pytest

from langchain.agents import create_agent
from config import SYSTEM_PROMPT

USER_INPUT = "Dans quelle commune et quel département se trouve le 1 rue de Rivoli, Paris?"


@pytest.mark.asyncio
async def test_chaining_geocode_adminexpress(mcp_tools, model, tracker):
    """Test chaining: geocode -> adminexpress.

    The agent should geocode the address first, then use adminexpress
    to find the commune and département from the coordinates.
    """
    agent = create_agent(model=model, tools=mcp_tools, system_prompt=SYSTEM_PROMPT)
    assert agent is not None

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": USER_INPUT}]},
        config={"callbacks": [tracker]},
    )

    tool_names_called = {c.get("name") for c in tracker.tool_calls if c.get("type") == "start"}

    assert "geocode" in tool_names_called, "geocode tool was not called"
    assert "adminexpress" in tool_names_called, "adminexpress tool was not called"

    last_message = result["messages"][-1]
    message_text = str(last_message).lower()

    keywords = ["paris", "75", "île-de-france", "ile-de-france"]
    assert any(k in message_text for k in keywords), \
        f"None of {keywords} found in response"
