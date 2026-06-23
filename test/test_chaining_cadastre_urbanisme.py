import pytest

from langchain.agents import create_agent
from config import SYSTEM_PROMPT

USER_INPUT = "Quelles sont les règles d'urbanisme applicables au 73 avenue de Paris, Saint-Mandé?"


@pytest.mark.asyncio
async def test_chaining_geocode_cadastre_urbanisme(mcp_tools, model, tracker):
    """Test chaining: geocode -> cadastre -> urbanisme.
    
    The agent should geocode the address, find the cadastral parcel,
    then look up urban planning rules for that parcel.
    """
    agent = create_agent(model=model, tools=mcp_tools, system_prompt=SYSTEM_PROMPT)
    assert agent is not None

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": USER_INPUT}]},
        config={"callbacks": [tracker]},
    )

    tool_names_called = {c.get("name") for c in tracker.tool_calls if c.get("type") == "start"}

    assert "geocode" in tool_names_called, "geocode tool was not called"
    assert len(tool_names_called) >= 2, f"Expected at least 2 tools chained, got: {tool_names_called}"

    last_message = result["messages"][-1]
    message_text = str(last_message).lower()

    keywords = ["saint-mandé", "saint mandé", "saint mande", "urbanisme", "zone", "plu"]
    assert any(k in message_text for k in keywords), \
        f"None of {keywords} found in response"
