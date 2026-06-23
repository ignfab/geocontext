import pytest

from langchain.agents import create_agent
from config import SYSTEM_PROMPT

USER_INPUT = "Trouve une table contenant des cours d'eau, décris ses attributs, et donne-moi les cours d'eau proches du point longitude 1.44, latitude 43.6 (Toulouse)."


@pytest.mark.asyncio
async def test_chaining_discovery(mcp_tools, model, tracker):
    """Test full discovery workflow: search_types -> describe_type -> get_features.

    The agent should:
    1. Search for WFS types related to waterways
    2. Describe the schema of the found type
    3. Query features near Toulouse
    """
    agent = create_agent(model=model, tools=mcp_tools, system_prompt=SYSTEM_PROMPT)
    assert agent is not None

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": USER_INPUT}]},
        config={"callbacks": [tracker]},
    )

    tool_names_called = {c.get("name") for c in tracker.tool_calls if c.get("type") == "start"}

    assert "gpf_wfs_search_types" in tool_names_called, "gpf_wfs_search_types tool was not called"
    assert "gpf_wfs_describe_type" in tool_names_called, "gpf_wfs_describe_type tool was not called"
    assert "gpf_wfs_get_features" in tool_names_called, "gpf_wfs_get_features tool was not called"
    assert len(tool_names_called) >= 3, f"Expected at least 3 tools chained, got: {tool_names_called}"

    last_message = result["messages"][-1]
    message_text = str(last_message).lower()

    keywords = ["cours d'eau", "cours d'eau", "rivière", "riviere", "fleuve", "hydrographi", "toulouse", "garonne"]
    assert any(k in message_text for k in keywords), \
        f"None of {keywords} found in response"
