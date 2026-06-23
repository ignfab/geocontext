import pytest

from langchain.agents import create_agent
from config import SYSTEM_PROMPT

USER_INPUT = "Quelle est la capitale de la France"


@pytest.mark.asyncio
async def test_agent_creation_call_and_paris_in_response(mcp_tools, model):
    agent = create_agent(model=model, tools=mcp_tools, system_prompt=SYSTEM_PROMPT)
    assert agent is not None

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": USER_INPUT}]},
    )

    last_message = result["messages"][-1]
    assert "paris" in str(last_message).lower()
