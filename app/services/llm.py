import os
import time
import json
import asyncio
from typing import List, Dict, Any, Optional
import httpx
from app.config import settings

class LLMService:
    def __init__(self):
        self.groq_api_key = settings.GROQ_API_KEY
        self.gemini_api_key = settings.GEMINI_API_KEY or ""

    async def call_groq(
        self,
        model: str,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: str = "auto"
    ) -> Dict[str, Any]:
        """Calls Groq API using OpenAI-compatible chat completions."""
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.groq_api_key}",
            "Content-Type": "application/json"
        }
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": 0.2,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = tool_choice

        # Low-latency backoff: fail fast if rate-limited or sluggish
        delays = [1, 2]
        for idx, delay in enumerate(delays):
            try:
                async with httpx.AsyncClient(timeout=25.0) as client:
                    resp = await client.post(url, headers=headers, json=payload)
                    if resp.status_code == 429:
                        retry_after_hdr = resp.headers.get("retry-after")
                        try:
                            wait_time = float(retry_after_hdr) if retry_after_hdr else delay
                        except (ValueError, TypeError):
                            wait_time = delay
                        # Never block more than 2.5 seconds on rate limits; fail fast to fallback
                        if wait_time > 2.5:
                            raise RuntimeError(f"Groq rate-limited (retry-after: {wait_time}s). Fast failing to fallback.")
                        await asyncio.sleep(wait_time)
                        continue
                    resp.raise_for_status()
                    data = resp.json()
                    choice = data["choices"][0]
                    message = choice["message"]
                    tool_calls = message.get("tool_calls", [])
                    return {
                        "content": message.get("content"),
                        "tool_calls": tool_calls
                    }
            except Exception as e:
                if idx == len(delays) - 1:
                    raise e
                await asyncio.sleep(delay)
        raise RuntimeError("Groq call exceeded max retries")

    async def call_gemini_fallback(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Fallback to Google Gemini API when Groq fails or rate limits."""
        if not self.gemini_api_key:
            raise RuntimeError("Gemini fallback triggered but GEMINI_API_KEY is not set")

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_FALLBACK_MODEL}:generateContent?key={self.gemini_api_key}"
        
        # Convert OpenAI-style messages & tools to Gemini format
        contents = []
        system_instruction = None
        for m in messages:
            role = m["role"]
            content = m.get("content", "")
            if role == "system":
                system_instruction = {"parts": [{"text": content}]}
            elif role == "user":
                contents.append({"role": "user", "parts": [{"text": str(content)}]})
            elif role == "assistant":
                parts = []
                if content:
                    parts.append({"text": str(content)})
                if "tool_calls" in m:
                    for tc in m["tool_calls"]:
                        fn = tc.get("function", {})
                        args = fn.get("arguments", "{}")
                        if isinstance(args, str):
                            try:
                                args = json.loads(args)
                            except Exception:
                                args = {}
                        parts.append({
                            "functionCall": {
                                "name": fn.get("name"),
                                "args": args
                            }
                        })
                contents.append({"role": "model", "parts": parts})
            elif role == "tool":
                contents.append({
                    "role": "function",
                    "parts": [{
                        "functionResponse": {
                            "name": m.get("name", "tool"),
                            "response": {"output": m.get("content", "")}
                        }
                    }]
                })

        gemini_tools = []
        if tools:
            declarations = []
            for t in tools:
                fn = t.get("function", {})
                declarations.append({
                    "name": fn.get("name"),
                    "description": fn.get("description", ""),
                    "parameters": fn.get("parameters", {})
                })
            gemini_tools = [{"functionDeclarations": declarations}]

        body: Dict[str, Any] = {"contents": contents}
        if system_instruction:
            body["systemInstruction"] = system_instruction
        if gemini_tools:
            body["tools"] = gemini_tools

        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(url, json=body)
            resp.raise_for_status()
            res = resp.json()
            candidate = res.get("candidates", [{}])[0]
            content_obj = candidate.get("content", {})
            parts = content_obj.get("parts", [])
            
            text_parts = []
            tool_calls = []
            for idx, p in enumerate(parts):
                if "text" in p:
                    text_parts.append(p["text"])
                if "functionCall" in p:
                    fc = p["functionCall"]
                    tool_calls.append({
                        "id": f"call_{idx}_{int(time.time())}",
                        "type": "function",
                        "function": {
                            "name": fc.get("name"),
                            "arguments": json.dumps(fc.get("args", {}))
                        }
                    })
            return {
                "content": "".join(text_parts) if text_parts else None,
                "tool_calls": tool_calls
            }

    async def chat_with_tools(
        self,
        task_weight: str,  # 'heavy' | 'light'
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: str = "auto"
    ) -> Dict[str, Any]:
        """
        Unified tool-calling method.
        Try Groq first (gpt-oss-120b for heavy, gpt-oss-20b for light).
        Falls back to Gemini on error or rate limit.
        """
        model = settings.GROQ_HEAVY_MODEL if task_weight == "heavy" else settings.GROQ_LIGHT_MODEL

        # If Groq key is present, try Groq
        if self.groq_api_key:
            try:
                return await self.call_groq(model, messages, tools, tool_choice)
            except Exception as e:
                # Fallback to Gemini
                if self.gemini_api_key:
                    return await self.call_gemini_fallback(messages, tools)
                raise e
        elif self.gemini_api_key:
            return await self.call_gemini_fallback(messages, tools)
        else:
            raise RuntimeError(
                "Neither GROQ_API_KEY nor GEMINI_API_KEY is configured in .env"
            )

llm_service = LLMService()
