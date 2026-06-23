import pytest

from langchain.agents import create_agent
from config import SYSTEM_PROMPT

USER_INPUT = "Récupère l'objet WFS de la commune dont le feature_id est 'commune.8952' sur le typename 'ADMINEXPRESS-COG.LATEST:commune'. Donne-moi son nom et son code INSEE."


@pytest.mark.asyncio
async def test_get_feature_by_id(mcp_tools, model, tracker):
    tool = next((t for t in mcp_tools if t.name == "gpf_wfs_get_feature_by_id"), None)
    assert tool is not None, "Tool 'gpf_wfs_get_feature_by_id' not found"

    agent = create_agent(model=model, tools=mcp_tools, system_prompt=SYSTEM_PROMPT)
    assert agent is not None

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": USER_INPUT}]},
        config={"callbacks": [tracker]},
    )

    get_by_id_calls = [c for c in tracker.tool_calls if c.get("name") == "gpf_wfs_get_feature_by_id"]
    assert len(get_by_id_calls) > 0, "gpf_wfs_get_feature_by_id tool was not called"

    last_message = result["messages"][-1]
    message_text = str(last_message).lower()

    # commune.8952 corresponds to Aurel (code INSEE 26019)
    keywords = ["aurel", "26019"]
    assert any(k in message_text for k in keywords), \
        f"None of {keywords} found in response: {message_text[:500]}"
