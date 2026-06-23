import pytest

from langchain.agents import create_agent
from config import SYSTEM_PROMPT

USER_INPUT = "Quels sont les attributs de la table BDTOPO_V3:batiment?"


@pytest.mark.asyncio
async def test_describe_type(mcp_tools, model, tracker):
    describe_tool = next((t for t in mcp_tools if t.name == "gpf_wfs_describe_type"), None)
    assert describe_tool is not None, "Tool 'gpf_wfs_describe_type' not found"

    agent = create_agent(model=model, tools=mcp_tools, system_prompt=SYSTEM_PROMPT)
    assert agent is not None

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": USER_INPUT}]},
        config={"callbacks": [tracker]},
    )

    describe_calls = [c for c in tracker.tool_calls if c.get("name") == "gpf_wfs_describe_type"]
    assert len(describe_calls) > 0, "gpf_wfs_describe_type tool was not called"

    last_message = result["messages"][-1]
    message_text = str(last_message).lower()

    assert "geometrie" in message_text or "geometry" in message_text or "hauteur" in message_text
