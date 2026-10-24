import os
import asyncio
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
        cleaned = "\n".join(line.strip() for line in text.splitlines())
        pages.append({
            "page_number": page_num,
            "text": cleaned
        })
    return pages

def validate_selectable_text(pages: List[Dict[str, Any]]) -> None:
    """Validates that extracted pages have selectable text (not blank or scanned image)."""
    if not pages:
        raise ValueError("no_selectable_text: The uploaded PDF is empty. Please upload a valid digital textbook PDF.")
    total_chars = sum(len(p.get("text", "").strip()) for p in pages)
    if total_chars < 50:
        raise ValueError("no_selectable_text: The uploaded PDF does not contain selectable text (may be scanned images). Please upload a digital textbook PDF with selectable text.")

async def store_pdf_file(parent_id: str, filename: str, pdf_bytes: bytes) -> str:
    """Stores PDF locally and attempts Supabase Private Storage upload."""
    safe_name = os.path.basename(filename) if filename else f"{uuid.uuid4().hex[:8]}.pdf"
    if not safe_name.lower().endswith(".pdf"):
        safe_name = f"{safe_name}.pdf"

    # Local fallback directory
    parent_dir = os.path.join(settings.STORAGE_LOCAL_DIR, parent_id)
    os.makedirs(parent_dir, exist_ok=True)
    local_path = os.path.join(parent_dir, safe_name)
    with open(local_path, "wb") as f:
        f.write(pdf_bytes)

    storage_path = f"{parent_id}/{safe_name}"

    # Supabase Private Storage upload (bucket: 'textbooks')
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
        try:
            base_url = settings.SUPABASE_URL.rstrip('/')
            storage_endpoint = f"{base_url}/storage/v1/object/textbooks/{storage_path}"
            headers = {
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/pdf",
                "x-upsert": "true"
            }
            async with httpx.AsyncClient(timeout=30.0) as client:
                await client.post(storage_endpoint, headers=headers, content=pdf_bytes)
        except Exception:
            pass  # Seamless fallback to local storage

    return storage_path

async def ingest_uploaded_textbook(
    parent_id: str,
    grade: int,
    subject_tag: str,
    title: str,
    filename: str,
    pdf_bytes: bytes,
    db
) -> Tuple[str, int, List[Dict[str, Any]]]:
    """
    1. Extracts page text with pypdf
    2. Validates selectable text
    3. Stores PDF in Supabase/local storage
    4. Registers textbook and source_pages in database
    """
    pages = await asyncio.to_thread(extract_pdf_pages, pdf_bytes)
    validate_selectable_text(pages)
    page_count = len(pages)

    storage_path = await store_pdf_file(parent_id, filename, pdf_bytes)

    textbook_id = str(uuid.uuid4())
    ncert_code = f"upload_{grade}_{subject_tag.lower()}_{uuid.uuid4().hex[:6]}"

    # Insert textbooks row
    await db.execute("""
        INSERT INTO textbooks (id, parent_id, grade, subject_tag, title, ncert_code, storage_path, page_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (textbook_id, parent_id, grade, subject_tag, title, ncert_code, storage_path, page_count))

    # Batch inserts avoid one async round-trip per PDF page.
    await db.executemany("""
        INSERT INTO source_pages (id, textbook_id, topic_id, page_number, text)
        VALUES (?, ?, NULL, ?, ?)
    """, [(str(uuid.uuid4()), textbook_id, p["page_number"], p["text"]) for p in pages])

    await db.commit()
    return textbook_id, page_count, pages

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

    pages = await asyncio.to_thread(extract_pdf_pages, pdf_bytes)
    page_count = len(pages)

    # Insert textbooks row
    await db.execute("""
        INSERT INTO textbooks (id, parent_id, grade, subject_tag, title, ncert_code, storage_path, page_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (textbook_id, parent_id, grade, subject_tag, title, ncert_code, storage_path, page_count))

    await db.executemany("""
        INSERT INTO source_pages (id, textbook_id, topic_id, page_number, text)
        VALUES (?, ?, NULL, ?, ?)
    """, [(str(uuid.uuid4()), textbook_id, p["page_number"], p["text"]) for p in pages])

    await db.commit()
    return textbook_id, page_count, pages
