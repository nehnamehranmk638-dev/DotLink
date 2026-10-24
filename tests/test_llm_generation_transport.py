import json
import httpx
import pytest
from app.agents.lesson_revision_agent import AGENT_2_TOOLS
from app.services.llm import LLMService


@pytest.mark.asyncio
async def test_gemini_accepts_full_pydantic_tool_schema_without_exposing_key_in_url(monkeypatch):
    requests = []
    def respond(request):
        requests.append(request)
        return httpx.Response(200, json={'candidates': [{'content': {'parts': [
            {'functionCall': {'name': 'get_page_text', 'args': {'page_number': 1}}}
        ]}}]})
    original_client = httpx.AsyncClient
    monkeypatch.setattr('app.services.llm.httpx.AsyncClient', lambda **kwargs:
        original_client(transport=httpx.MockTransport(respond), **kwargs))
    service = LLMService()
    service.gemini_api_key = 'test-only-key'
    result = await service.call_gemini_fallback([{'role': 'user', 'content': 'Read page 1.'}], AGENT_2_TOOLS)
    body = json.loads(requests[0].content)
    submit_schema = body['tools'][0]['functionDeclarations'][-1]
    assert submit_schema['parametersJsonSchema'] == AGENT_2_TOOLS[-1]['function']['parameters']
    assert '$defs' in submit_schema['parametersJsonSchema']
    assert 'parameters' not in submit_schema
    assert 'key=' not in str(requests[0].url)
    assert requests[0].headers['x-goog-api-key'] == 'test-only-key'
    assert result['tool_calls'][0]['function']['name'] == 'get_page_text'
