import json
import uuid
from typing import Dict, Any, List, Optional, Callable, Awaitable, Type
from pydantic import BaseModel, ValidationError
from app.config import settings
from app.services.llm import llm_service

async def log_agent_step(
    db,
    run_id: str,
    topic_id: str,
    agent_name: str,
    step_num: int,
    tool_name: str,
    args: Dict[str, Any],
    result_summary: str
):
    step_id = str(uuid.uuid4())
    await db.execute("""
        INSERT INTO agent_steps (id, run_id, topic_id, agent_name, step_num, tool_name, args_json, result_summary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (step_id, run_id, topic_id, agent_name, step_num, tool_name, json.dumps(args), result_summary[:500]))
    await db.commit()

async def run_agent_loop(
    agent_name: str,
    run_id: str,
    topic_id: str,
    task_weight: str,
    messages: List[Dict[str, Any]],
    tool_definitions: List[Dict[str, Any]],
    tool_executor: Callable[[str, Dict[str, Any]], Awaitable[Dict[str, Any]]],
    submit_tool_name: str,
    submit_validator: Type[BaseModel],
    db,
    max_steps: int = settings.AGENT_MAX_STEPS,
    max_retries: int = settings.AGENT_MAX_RETRIES,
) -> BaseModel:
    """
    Shared ~60-line autonomous tool-calling loop.
    Calls LLM, logs every tool execution to agent_steps, validates submit tool with Pydantic,
    handles validation error retries, and returns the final validated payload.
    """
    step_num = 1
    retry_count = 0

    while step_num <= max_steps:
        resp = await llm_service.chat_with_tools(task_weight, messages, tool_definitions)
        assistant_content = resp.get("content")
        tool_calls = resp.get("tool_calls", [])

        if not tool_calls:
            if assistant_content:
                messages.append({"role": "assistant", "content": assistant_content})
            step_num += 1
            continue

        messages.append({"role": "assistant", "content": assistant_content, "tool_calls": tool_calls})

        for tc in tool_calls:
            fn = tc.get("function", {})
            name = fn.get("name")
            call_id = tc.get("id", f"call_{step_num}")
            args_str = fn.get("arguments", "{}")
            args = json.loads(args_str) if isinstance(args_str, str) else args_str

            if name == submit_tool_name:
                try:
                    validated = submit_validator.model_validate(args)
                    await log_agent_step(db, run_id, topic_id, agent_name, step_num, name, args, "Validation Passed")
                    return validated
                except ValidationError as e:
                    retry_count += 1
                    err_msg = f"Validation Error in {submit_tool_name}: {str(e)}"
                    await log_agent_step(db, run_id, topic_id, agent_name, step_num, name, args, err_msg)
                    if retry_count > max_retries:
                        raise RuntimeError(f"Agent {agent_name} failed submit validation after {max_retries} retries: {err_msg}")
                    messages.append({
                        "role": "tool",
                        "tool_call_id": call_id,
                        "name": name,
                        "content": f"ERROR: Your submission failed validation: {err_msg}. Please fix and call {submit_tool_name} again."
                    })
                    break
            else:
                tool_res = await tool_executor(name, args)
                summary = str(tool_res)[:400]
                await log_agent_step(db, run_id, topic_id, agent_name, step_num, name, args, summary)
                messages.append({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "name": name,
                    "content": json.dumps(tool_res)
                })

            step_num += 1

    raise RuntimeError(f"Agent {agent_name} exceeded max steps ({max_steps}) without successful submission.")
