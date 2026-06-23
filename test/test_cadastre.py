import pytest

from langchain.agents import create_agent
from config import SYSTEM_PROMPT

USER_INPUT = "Quelle est la parcelle cadastrale au 73 avenue de Paris, Saint-Mandé?"


@pytest.mark.asyncio
async def test_cadastre(mcp_tools, model, tracker):
    cadastre_tool = next((t for t in mcp_tools if t.name == "cadastre"), None)
    assert cadastre_tool is not None, "Tool 'cadastre' not found"

    agent = create_agent(model=model, tools=mcp_tools, system_prompt=SYSTEM_PROMPT)
    assert agent is not None

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": USER_INPUT}]},
        config={"callbacks": [tracker]},
    )

    cadastre_calls = [c for c in tracker.tool_calls if c.get("name") == "cadastre"]
    assert len(cadastre_calls) > 0, "cadastre tool was not called"

    last_message = result["messages"][-1]
    message_text = str(last_message).lower()

    keywords = ["saint-mandé", "saint mandé", "saint mande", "parcelle", "cadastre"]
    assert any(k in message_text for k in keywords), \
        f"None of {keywords} found in response"
