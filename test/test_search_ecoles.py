import pytest

from langchain.agents import create_agent
from config import SYSTEM_PROMPT

USER_INPUT = "Dans quelle table peut-on trouver des informations sur les écoles?"


@pytest.mark.asyncio
async def test_search_ecoles(mcp_tools, model, tracker):
    agent = create_agent(
        model=model,
        tools=mcp_tools,
        system_prompt=SYSTEM_PROMPT
    )
    assert agent is not None

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": USER_INPUT}]},
        config={"callbacks": [tracker]},
    )

    search_calls = [c for c in tracker.tool_calls if c.get("name") == "gpf_wfs_search_types"]
    assert len(search_calls) > 0, "gpf_wfs_search_types tool was not called"

    last_message = result["messages"][-1]
    message_text = str(last_message).lower()

    keywords = ["erp", "école", "ecole", "enseignement", "zone_d_activite", "bdtopo", "scolaire"]
    assert any(k in message_text for k in keywords), \
        f"None of {keywords} found in response"

