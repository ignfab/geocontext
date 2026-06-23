import pytest

from langchain.agents import create_agent
from config import SYSTEM_PROMPT

USER_INPUT = "Quelles sont les règles d'urbanisme applicables au 73 avenue de Paris, Saint-Mandé?"


@pytest.mark.asyncio
async def test_urbanisme(mcp_tools, model, tracker):
    urbanisme_tool = next((t for t in mcp_tools if t.name == "urbanisme"), None)
    assert urbanisme_tool is not None, "Tool 'urbanisme' not found"

    agent = create_agent(model=model, tools=mcp_tools, system_prompt=SYSTEM_PROMPT)
    assert agent is not None

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": USER_INPUT}]},
        config={"callbacks": [tracker]},
    )

    urbanisme_calls = [c for c in tracker.tool_calls if c.get("name") == "urbanisme"]
    assert len(urbanisme_calls) > 0, "urbanisme tool was not called"

    last_message = result["messages"][-1]
    message_text = str(last_message)

    keywords = ["saint-mandé", "saint mandé", "saint mande", "urbanisme", "zone", "plu", "règle", "regle"]
    assert any(k in message_text.lower() for k in keywords), \
        f"None of {keywords} found in response"
