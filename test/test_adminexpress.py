import pytest

from langchain.agents import create_agent
from config import SYSTEM_PROMPT

USER_INPUT = "Dans quelle commune et quel département se trouve le point de coordonnées longitude 2.35, latitude 48.85?"


@pytest.mark.asyncio
async def test_adminexpress(mcp_tools, model, tracker):
    admin_tool = next((t for t in mcp_tools if t.name == "adminexpress"), None)
    assert admin_tool is not None, "Tool 'adminexpress' not found"

    agent = create_agent(model=model, tools=mcp_tools, system_prompt=SYSTEM_PROMPT)
    assert agent is not None

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": USER_INPUT}]},
        config={"callbacks": [tracker]},
    )

    admin_calls = [c for c in tracker.tool_calls if c.get("name") == "adminexpress"]
    assert len(admin_calls) > 0, "adminexpress tool was not called"

    last_message = result["messages"][-1]
    message_text = str(last_message).lower()

    keywords = ["paris", "75", "île-de-france", "ile-de-france"]
    assert any(k in message_text for k in keywords), \
        f"None of {keywords} found in response"
