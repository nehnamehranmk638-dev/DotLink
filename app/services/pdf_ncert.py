import os
import io
import json
import uuid
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import httpx
from pypdf import PdfReader, PdfWriter
from app.config import settings

CATALOG_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "ncert_catalog.json"

def get_ncert_catalog() -> List[Dict[str, Any]]:
    if not CATALOG_PATH.exists():
        return []
    with open(CATALOG_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("catalog", [])

def lookup_ncert_entry(grade: int, subject: str, chapter_num: int) -> Optional[Dict[str, Any]]:
    catalog = get_ncert_catalog()
    sub_lower = subject.strip().lower()
    for item in catalog:
        if (
            item.get("grade") == grade
            and item.get("subject", "").strip().lower() == sub_lower
            and item.get("chapter_num") == chapter_num
        ):
            return item
    return None

def extract_pdf_pages(pdf_bytes: bytes) -> List[Dict[str, Any]]:
    """Extracts text per page from PDF bytes using pypdf."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    pages = []
    for idx, page in enumerate(reader.pages):
        page_num = idx + 1
        text = page.extract_text() or ""
        # Clean text
        cleaned = "\n".join([line.strip() for line in text.splitlines() if line.strip()])
        pages.append({
            "page_number": page_num,
            "text": cleaned
        })
    return pages

async def download_ncert_pdf(url: str) -> bytes:
    """Downloads PDF from NCERT URL. Raises ValueError if URL is placeholder."""
    if not url or "TODO_" in url:
        raise ValueError(f"NCERT URL '{url}' is a placeholder. Please use manual PDF upload fallback.")
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content

async def ingest_pdf_content(
    parent_id: str,
    grade: int,
    subject_tag: str,
    title: str,
    ncert_code: str,
    pdf_bytes: bytes,
    db
) -> Tuple[str, int, List[Dict[str, Any]]]:
    """
    Saves PDF file, extracts text to source_pages, and records textbooks row.
    """
    textbook_id = str(uuid.uuid4())
    os.makedirs(settings.STORAGE_LOCAL_DIR, exist_ok=True)
    storage_path = os.path.join(settings.STORAGE_LOCAL_DIR, f"{textbook_id}.pdf")
    
    with open(storage_path, "wb") as f:
        f.write(pdf_bytes)

    pages = extract_pdf_pages(pdf_bytes)
    page_count = len(pages)

    # Insert textbooks row
    await db.execute("""
        INSERT INTO textbooks (id, parent_id, grade, subject_tag, title, ncert_code, storage_path, page_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (textbook_id, parent_id, grade, subject_tag, title, ncert_code, storage_path, page_count))

    # Insert source_pages rows
    for p in pages:
        page_id = str(uuid.uuid4())
        await db.execute("""
            INSERT INTO source_pages (id, textbook_id, topic_id, page_number, text)
            VALUES (?, ?, NULL, ?, ?)
        """, (page_id, textbook_id, p["page_number"], p["text"]))

    await db.commit()
    return textbook_id, page_count, pages
