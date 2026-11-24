import os
import re
import asyncio
import io
import json
import uuid
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Set
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

def _page_text(p: Any) -> str:
    """Safely extracts text string from dict, sqlite3.Row, or object."""
    if isinstance(p, dict):
        return p.get("text", "") or ""
    try:
        return p["text"] or ""
    except Exception:
        return getattr(p, "text", "") or ""

def validate_selectable_text(pages: List[Dict[str, Any]]) -> None:
    """Validates that extracted pages have selectable text (not blank or scanned image)."""
    if not pages:
        raise ValueError("no_selectable_text: The uploaded PDF is empty. Please upload a valid digital textbook PDF.")
    total_chars = sum(len(_page_text(p).strip()) for p in pages)
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

def find_running_headers_and_footers(pages) -> Set[str]:
    """
    Identifies lines that appear repeatedly at the top or bottom of pages across the document.
    E.g. 'Santoor | Grade 4', 'Page 1', 'Free Distribution by Govt.', running chapter tags.
    """
    if len(pages) < 2:
        return set()

    line_counts: Dict[str, int] = {}
    for p in pages:
        txt = _page_text(p)
        raw_lines = [l.strip() for l in txt.splitlines() if l.strip()]
        if not raw_lines:
            continue
        top_lines = raw_lines[:3]
        bottom_lines = raw_lines[-3:] if len(raw_lines) > 3 else []
        candidates = set(top_lines + bottom_lines)
        for cand in candidates:
            norm = re.sub(r'\s+', ' ', cand).strip().lower()
            if len(norm) <= 75:
                line_counts[norm] = line_counts.get(norm, 0) + 1

    threshold = 2 if len(pages) <= 4 else max(2, int(len(pages) * 0.30))
    running = {line for line, cnt in line_counts.items() if cnt >= threshold}
    return running

def is_toc_page_text(text: str) -> bool:
    """Detects if page text corresponds to Table of Contents."""
    lines = [l.strip().lower() for l in text.splitlines() if l.strip()]
    for line in lines[:6]:
        if line in ["contents", "table of contents", "index", "syllabus"]:
            return True
        if re.match(r'^(?:contents|table of contents)\b', line):
            return True
    return False

def extract_metadata_from_pages(pages: List[Dict[str, Any]], filename: str = "") -> Dict[str, Any]:
    """
    Extracts textbook title, chapter heading, grade, and subject from document content.
    Distinguishes real headings from running headers/footers and Table of Contents.
    """
    running_headers = find_running_headers_and_footers(pages)
    
    detected_grade = None
    detected_subject = None
    detected_title = None
    detected_chapter_num = 1
    confidence = "none"

    subject_map = {
        "santoor": "English", "marigold": "English", "mridang": "English",
        "honeysuckle": "English", "honeycomb": "English", "poorvi": "English",
        "maths-magic": "Maths", "maths magic": "Maths", "mathematics": "Maths",
        "math-magic": "Maths", "ganit": "Maths",
        "science": "Science", "curiosity": "Science", "vigyan": "Science",
        "looking around": "EVS", "evs": "EVS", "environmental": "EVS", "our environment": "EVS",
        "rimjhim": "Hindi", "sarangi": "Hindi", "veena": "Hindi", "vasant": "Hindi", "durva": "Hindi",
        "social science": "Social Studies", "social studies": "Social Studies", "our pasts": "Social Studies"
    }

    sample_texts = list(running_headers)
    for p in pages[:4]:
        sample_texts.extend(_page_text(p).splitlines()[:5])

    for raw in sample_texts:
        line = raw.strip()
        gm = re.search(r'\b(?:Grade|Class)\s*([0-9IVX]+)\b', line, re.IGNORECASE)
        if gm and not detected_grade:
            val = gm.group(1).upper()
            roman = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10, "XI": 11, "XII": 12}
            detected_grade = roman.get(val, int(val) if val.isdigit() else None)

        line_lower = line.lower()
        for key, subj in subject_map.items():
            if key in line_lower and not detected_subject:
                detected_subject = subj
                break

    content_pages = [p for p in pages if not is_toc_page_text(_page_text(p))]
    if not content_pages:
        content_pages = pages

    first_page = content_pages[0]
    raw_lines = [l.strip() for l in _page_text(first_page).splitlines() if l.strip()]

    clean_lines = []
    for l in raw_lines:
        norm = re.sub(r'\s+', ' ', l).strip().lower()
        if norm in running_headers:
            continue
        if re.match(r'^(?:page\s*)?\d+$', l, re.IGNORECASE):
            continue
        if re.search(r'^(?:isbn|national council of educational|ncert|free distribution|reprint|preface)\b', l, re.IGNORECASE):
            continue
        if re.search(r'^(?:santoor|marigold|maths magic|science)\s*[\|\-–—]\s*(?:grade|class)\s*\d+$', l, re.IGNORECASE):
            continue
        clean_lines.append(l)

    for i, line in enumerate(clean_lines[:8]):
        unit_m = re.match(r'^(?:Unit|Theme|Part)\s*(\d+)(?:[:\s\.\-–—]+([^\n\r]+))?$', line, re.IGNORECASE)
        chap_m = re.match(r'^(?:Chapter|Lesson)\s*(\d+)[:\s\.\-–—]+([^\n\r]+)$', line, re.IGNORECASE)
        num_title_m = re.match(r'^(\d+)[\.\s\-–—]+([A-Z][A-Za-z0-9\s,\-–—\']{2,60})$', line)

        if unit_m:
            unit_num = int(unit_m.group(1))
            unit_sub = unit_m.group(2).strip() if unit_m.group(2) else ""
            next_lines = clean_lines[i+1:i+4]
            story_title = None
            for nl in next_lines:
                sm = re.match(r'^(?:(\d+)[\.\s\-–—]+)?([A-Z][A-Za-z0-9\s,\-–—\']{2,60})$', nl)
                if sm and not re.match(r'^(?:let us|activity|exercise|poem)\b', nl, re.IGNORECASE):
                    story_title = sm.group(2).strip()
                    if sm.group(1):
                        detected_chapter_num = int(sm.group(1))
                    break
                elif not unit_sub and not nl.isdigit() and len(nl) < 50:
                    unit_sub = nl

            if story_title:
                detected_title = story_title
                detected_chapter_num = detected_chapter_num or unit_num
                confidence = "high"
                break
            elif unit_sub:
                detected_title = unit_sub
                detected_chapter_num = unit_num
                confidence = "high"
                break

        if chap_m:
            detected_chapter_num = int(chap_m.group(1))
            detected_title = chap_m.group(2).strip()
            confidence = "high"
            break

        if num_title_m:
            detected_chapter_num = int(num_title_m.group(1))
            detected_title = num_title_m.group(2).strip()
            confidence = "high"
            break

        standalone_chap = re.match(r'^(?:Chapter|Lesson|Unit)\s*(\d+)$', line, re.IGNORECASE)
        if standalone_chap and i + 1 < len(clean_lines):
            next_line = clean_lines[i+1]
            if len(next_line.split()) <= 8 and not re.match(r'^(?:page|\d+|let us)\b', next_line, re.IGNORECASE):
                detected_chapter_num = int(standalone_chap.group(1))
                detected_title = next_line.strip()
                confidence = "high"
                break

    if not detected_title and clean_lines:
        for line in clean_lines[:4]:
            words = line.split()
            if 2 <= len(words) <= 8 and all(w[0].isupper() or w.lower() in {'a', 'an', 'the', 'of', 'and', 'in', 'with', 'to', 'for', 'we', 'our', 'my'} for w in words):
                if not re.search(r'^(?:page\s*\d+|\d+|contents|table of contents|preface)$', line, re.IGNORECASE):
                    detected_title = line.strip()
                    confidence = "medium"
                    break

    if detected_title:
        detected_title = re.sub(r'^(?:Chapter|Unit|Lesson|Topic|Section)\s*[\d\.\-:]+\s*', '', detected_title, flags=re.IGNORECASE).strip()
        detected_title = re.sub(r'^\d+\.?\s*', '', detected_title).strip()
        detected_title = re.sub(r'[:\s#*_\-]+$', '', detected_title).strip()

    return {
        "detected_title": detected_title,
        "detected_chapter_number": detected_chapter_num,
        "detected_grade": detected_grade,
        "detected_subject": detected_subject,
        "confidence": confidence,
        "running_headers": running_headers
    }

async def ingest_uploaded_textbook(
    parent_id: str,
    grade: int,
    subject_tag: str,
    title: str,
    filename: str,
    pdf_bytes: bytes,
    db,
    pre_extracted_pages: Optional[List[Dict[str, Any]]] = None
) -> Tuple[str, int, List[Dict[str, Any]]]:
    """
    1. Extracts page text with pypdf (or reuses pre_extracted_pages)
    2. Validates selectable text
    3. Stores PDF in Supabase/local storage
    4. Registers textbook and source_pages in database
    """
    pages = pre_extracted_pages if pre_extracted_pages is not None else await asyncio.to_thread(extract_pdf_pages, pdf_bytes)
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
