"""Exact topic snapshots stored in existing agent trace JSON (no schema change)."""
import json


async def get_topic_pages(db, topic):
    cursor = await db.execute(
        "SELECT args_json FROM agent_steps WHERE topic_id = ? AND tool_name = 'topic_source' ORDER BY created_at DESC LIMIT 1",
        (topic["id"],),
    )
    snapshot = await cursor.fetchone()
    if snapshot:
        return {int(p["page_number"]): p["text"] for p in json.loads(snapshot["args_json"])["pages"]}
    cursor = await db.execute(
        "SELECT page_number, text FROM source_pages WHERE textbook_id = ? AND page_number BETWEEN ? AND ? ORDER BY page_number",
        (topic["textbook_id"], topic["start_page"], topic["end_page"]),
    )
    return {p["page_number"]: p["text"] for p in await cursor.fetchall()}
