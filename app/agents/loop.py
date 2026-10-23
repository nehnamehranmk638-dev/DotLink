import json
from typing import List, Dict, Any, Callable, Optional, Type
from pydantic import BaseModel
from app.services.llm import llm_service, ChatReply
from app.deps import get_supabase_admin

MAX_STEPS = 8

async def run_agent_loop(
    agent_name: str,
    system_prompt: str,
    user_goal: str,
    tools_definitions: List[Dict[str, Any]],
    tool_handlers: Dict[str, Callable],
    submit_tool_name: str,
    pydantic_output_model: Type[BaseModel],
    topic_id: Optional[str] = None,
    session_id: Optional[str] = None
) -> tuple[Optional[BaseModel], str]:
    """
    Plain Python 60-line agent loop.
    Logs each step to agent_runs and agent_steps tables.
    Returns (validated_output, run_id).
    """
    admin = get_supabase_admin()

    # 1. Initialize run in DB
    run_res = admin.table("agent_runs").insert({
        "agent": agent_name,
        "topic_id": topic_id,
        "session_id": session_id,
        "status": "running"
    }).execute()
    run_id = run_res.data[0]["id"] if run_res.data else "local-run"

    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_goal}
    ]

    final_payload: Optional[BaseModel] = None

    for step_num in range(1, MAX_STEPS + 1):
        try:
            reply: ChatReply = await llm_service.chat(messages, tools=tools_definitions)
        except Exception as e:
            # Log failure step
            admin.table("agent_steps").insert({
                "run_id": run_id,
                "step": step_num,
                "tool": "error",
                "args": {},
                "result": {"error": str(e)},
                "thought": "LLM call encountered an error."
            }).execute()
            break

        # Check if model made tool calls
        if reply.tool_calls:
            for tc in reply.tool_calls:
                fn_name = tc["function"]["name"]
                args = tc["function"].get("arguments", {})
                thought = reply.content or f"Calling tool {fn_name}"

                # Check if it is the submit tool
                if fn_name == submit_tool_name:
                    try:
                        validated = pydantic_output_model.model_validate(args)
                        final_payload = validated
                        result = {"status": "success", "message": "Payload schema validated"}
                    except Exception as val_e:
                        result = {"status": "error", "message": f"Schema validation failed: {val_e}"}

                    admin.table("agent_steps").insert({
                        "run_id": run_id,
                        "step": step_num,
                        "tool": fn_name,
                        "args": args,
                        "result": result,
                        "thought": thought
                    }).execute()

                    if final_payload:
                        admin.table("agent_runs").update({
                            "status": "completed",
                            "summary": f"Completed in {step_num} steps."
                        }).eq("id", run_id).execute()
                        return final_payload, run_id

                # Regular tool execution
                elif fn_name in tool_handlers:
                    handler = tool_handlers[fn_name]
                    try:
                        res = handler(**args) if isinstance(args, dict) else handler()
                    except Exception as tool_err:
                        res = {"error": str(tool_err)}

                    admin.table("agent_steps").insert({
                        "run_id": run_id,
                        "step": step_num,
                        "tool": fn_name,
                        "args": args if isinstance(args, dict) else {},
                        "result": res if isinstance(res, dict) else {"output": res},
                        "thought": thought
                    }).execute()

                    # Feed result back to model messages
                    messages.append({
                        "role": "assistant",
                        "content": reply.content or f"Used {fn_name}"
                    })
                    messages.append({
                        "role": "user",
                        "content": f"[Tool Result from {fn_name}]: {json.dumps(res)}"
                    })
        else:
            # Model responded with plain text without tool call
            admin.table("agent_steps").insert({
                "run_id": run_id,
                "step": step_num,
                "tool": "thought",
                "args": {},
                "result": {"content": reply.content},
                "thought": reply.content
            }).execute()
            break

    # If the agent finished loop without calling submit_tool, try direct json_call fallback
    if not final_payload:
        try:
            fallback = await llm_service.json_call(
                f"{user_goal}\nProvide your complete final output matching the schema.",
                pydantic_output_model
            )
            final_payload = fallback
            admin.table("agent_runs").update({
                "status": "completed",
                "summary": "Completed via direct schema synthesis."
            }).eq("id", run_id).execute()
        except Exception as e:
            admin.table("agent_runs").update({
                "status": "failed",
                "summary": f"Failed: {str(e)}"
            }).eq("id", run_id).execute()

    return final_payload, run_id
