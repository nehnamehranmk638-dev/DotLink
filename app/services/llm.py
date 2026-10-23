import json
import asyncio
from typing import List, Dict, Any, Optional, Type
from pydantic import BaseModel
from app.config import settings

class ChatReply(BaseModel):
    content: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None

class LLMService:
    def __init__(self):
        self.groq_client = None
        self.gemini_client = None

        if settings.GROQ_API_KEY:
            try:
                from groq import Groq
                self.groq_client = Groq(api_key=settings.GROQ_API_KEY)
            except Exception as e:
                print(f"[LLM] Groq client init failed: {e}")

        if settings.GEMINI_API_KEY:
            try:
                from google import genai
                self.gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
            except Exception as e:
                print(f"[LLM] Gemini client init failed: {e}")

    def get_model_name(self, tier: str = "main") -> str:
        if settings.LLM_PROVIDER == "groq" and self.groq_client:
            return settings.GROQ_MODEL_FAST if tier == "fast" else settings.GROQ_MODEL_MAIN
        return settings.GEMINI_MODEL

    async def chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        tier: str = "main"
    ) -> ChatReply:
        """
        Executes a chat completion with 20s timeout and 1 retry.
        Uses Groq primarily; falls back to Gemini if provider is gemini or Groq fails.
        """
        for attempt in range(2):
            try:
                if settings.LLM_PROVIDER == "groq" and self.groq_client:
                    return await asyncio.wait_for(
                        self._groq_chat(messages, tools, tier),
                        timeout=20.0
                    )
                elif self.gemini_client:
                    return await asyncio.wait_for(
                        self._gemini_chat(messages, tools),
                        timeout=20.0
                    )
                else:
                    raise RuntimeError("No LLM client configured (missing GROQ_API_KEY and GEMINI_API_KEY).")
            except Exception as e:
                print(f"[LLM Chat Attempt {attempt+1} Error]: {e}")
                if attempt == 0:
                    # Switch to gemini fallback on second attempt if groq failed
                    if self.gemini_client and settings.LLM_PROVIDER == "groq":
                        try:
                            return await asyncio.wait_for(self._gemini_chat(messages, tools), timeout=20.0)
                        except Exception as gem_e:
                            print(f"[LLM Gemini Fallback Error]: {gem_e}")
                    await asyncio.sleep(1.0)
                else:
                    raise RuntimeError(f"LLM request timed out or failed after retry: {str(e)}")

    async def _groq_chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]],
        tier: str
    ) -> ChatReply:
        model = self.get_model_name(tier)
        kwargs: Dict[str, Any] = {
            "model": model,
            "messages": messages,
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        response = await asyncio.to_thread(self.groq_client.chat.completions.create, **kwargs)
        message = response.choices[0].message

        tool_calls = None
        if message.tool_calls:
            tool_calls = [
                {
                    "id": tc.id,
                    "function": {
                        "name": tc.function.name,
                        "arguments": json.loads(tc.function.arguments) if isinstance(tc.function.arguments, str) else tc.function.arguments
                    }
                }
                for tc in message.tool_calls
            ]

        return ChatReply(content=message.content, tool_calls=tool_calls)

    async def _gemini_chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]]
    ) -> ChatReply:
        # Build prompt from messages
        prompt_lines = []
        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            prompt_lines.append(f"[{role.upper()}]:\n{content}")
        
        full_prompt = "\n\n".join(prompt_lines)

        response = await asyncio.to_thread(
            self.gemini_client.models.generate_content,
            model=settings.GEMINI_MODEL,
            contents=full_prompt
        )

        return ChatReply(content=response.text, tool_calls=None)

    async def json_call(
        self,
        prompt: str,
        response_model: Type[BaseModel],
        tier: str = "main"
    ) -> BaseModel:
        """
        Executes an LLM call expecting structured JSON matching the Pydantic schema.
        Includes 20s timeout, 1 retry, and strict Pydantic validation.
        """
        schema_json = json.dumps(response_model.model_json_schema())
        system_instruction = (
            f"You are a helpful educational AI. You MUST respond with ONLY a valid JSON object matching this schema:\n"
            f"{schema_json}\n"
            f"Do not include markdown codeblocks or conversational text. Output raw JSON only."
        )

        messages = [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": prompt}
        ]

        for attempt in range(2):
            try:
                if settings.LLM_PROVIDER == "groq" and self.groq_client:
                    model = self.get_model_name(tier)
                    resp = await asyncio.wait_for(
                        asyncio.to_thread(
                            self.groq_client.chat.completions.create,
                            model=model,
                            messages=messages,
                            response_format={"type": "json_object"}
                        ),
                        timeout=20.0
                    )
                    raw_content = resp.choices[0].message.content
                elif self.gemini_client:
                    resp = await asyncio.wait_for(
                        asyncio.to_thread(
                            self.gemini_client.models.generate_content,
                            model=settings.GEMINI_MODEL,
                            contents=f"{system_instruction}\n\nTask:\n{prompt}",
                            config={"response_mime_type": "application/json"}
                        ),
                        timeout=20.0
                    )
                    raw_content = resp.text
                else:
                    raise RuntimeError("No LLM client configured.")

                # Clean markdown backticks if present
                clean_json = raw_content.strip()
                if clean_json.startswith("```json"):
                    clean_json = clean_json[7:]
                if clean_json.startswith("```"):
                    clean_json = clean_json[3:]
                if clean_json.endswith("```"):
                    clean_json = clean_json[:-3]
                clean_json = clean_json.strip()

                return response_model.model_validate_json(clean_json)

            except Exception as e:
                print(f"[LLM json_call Attempt {attempt+1} Error]: {e}")
                if attempt == 0:
                    # Switch to Gemini on retry if Groq failed
                    if self.gemini_client and settings.LLM_PROVIDER == "groq":
                        try:
                            resp = await asyncio.wait_for(
                                asyncio.to_thread(
                                    self.gemini_client.models.generate_content,
                                    model=settings.GEMINI_MODEL,
                                    contents=f"{system_instruction}\n\nTask:\n{prompt}",
                                    config={"response_mime_type": "application/json"}
                                ),
                                timeout=20.0
                            )
                            clean_text = resp.text.strip()
                            if clean_text.startswith("```json"): clean_text = clean_text[7:]
                            if clean_text.startswith("```"): clean_text = clean_text[3:]
                            if clean_text.endswith("```"): clean_text = clean_text[:-3]
                            return response_model.model_validate_json(clean_text.strip())
                        except Exception as gem_e:
                            print(f"[Gemini json_call fallback error]: {gem_e}")
                    await asyncio.sleep(1.0)
                else:
                    raise RuntimeError(f"JSON model validation failed: {str(e)}")

llm_service = LLMService()
