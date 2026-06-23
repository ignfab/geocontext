import pytest

from langchain.agents import create_agent
from config import SYSTEM_PROMPT

USER_INPUT = "Y a-t-il des servitudes d'utilité publique au 10 place Bellecour, Lyon?"


@pytest.mark.asyncio
async def test_chaining_geocode_assiette_sup(mcp_tools, model, tracker):
    """Test chaining: geocode -> assiette_sup.

    The agent should geocode the address first, then use assiette_sup
    to look up servitudes d'utilité publique at those coordinates.
    """
    agent = create_agent(model=model, tools=mcp_tools, system_prompt=SYSTEM_PROMPT)
    assert agent is not None

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": USER_INPUT}]},
        config={"callbacks": [tracker]},
    )

    tool_names_called = {c.get("name") for c in tracker.tool_calls if c.get("type") == "start"}

    assert "geocode" in tool_names_called, "geocode tool was not called"
    assert "assiette_sup" in tool_names_called, "assiette_sup tool was not called"

    last_message = result["messages"][-1]
    message_text = str(last_message).lower()

    keywords = ["servitude", "assiette", "sup", "bellecour", "lyon", "utilité publique"]
    assert any(k in message_text for k in keywords), \
        f"None of {keywords} found in response"
