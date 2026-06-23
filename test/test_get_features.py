import pytest

from langchain.agents import create_agent
from config import SYSTEM_PROMPT

USER_INPUT = "Donne-moi les bâtiments de la BDTOPO proches du point longitude 6.87, latitude 45.92 (Chamonix)."


@pytest.mark.asyncio
async def test_get_features(mcp_tools, model, tracker):
    get_features_tool = next((t for t in mcp_tools if t.name == "gpf_wfs_get_features"), None)
    assert get_features_tool is not None, "Tool 'gpf_wfs_get_features' not found"

    agent = create_agent(model=model, tools=mcp_tools, system_prompt=SYSTEM_PROMPT)
    assert agent is not None

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": USER_INPUT}]},
        config={"callbacks": [tracker]},
    )

    wfs_calls = [c for c in tracker.tool_calls if c.get("name") in ("gpf_wfs_get_features", "gpf_wfs_search_types")]
    assert len(wfs_calls) > 0, "No WFS tool was called"

    last_message = result["messages"][-1]
    message_text = str(last_message).lower()

    assert "bâtiment" in message_text or "batiment" in message_text or "bdtopo" in message_text
