import io
from typing import List, Dict, Any, Tuple
from pypdf import PdfReader, PdfWriter
from app.config import settings

def extract_pdf_page_text(
    pdf_bytes: bytes,
    start_page: int,
    end_page: int
) -> Tuple[bool, List[Dict[str, Any]], str]:
    """
    Extracts text per page using pypdf for the given 1-indexed page range.
    Returns (success, pages_data, error_message).
    If any page has under MIN_TEXT_CHARS_PER_PAGE characters, returns no_selectable_text.
    """
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        total_pages = len(reader.pages)

        # Enforce range constraints
        start_idx = max(0, start_page - 1)
        end_idx = min(total_pages, end_page)

        if start_idx >= end_idx:
            return False, [], "Invalid page range: start page exceeds end page or total pages."

        if (end_idx - start_idx) > settings.MAX_PAGE_RANGE:
            return False, [], f"Page range exceeds maximum allowable chunk of {settings.MAX_PAGE_RANGE} pages."

        extracted_pages: List[Dict[str, Any]] = []

        for idx in range(start_idx, end_idx):
            page_num = idx + 1
            page = reader.pages[idx]
            text = (page.extract_text() or "").strip()

            # Check selectable text density
            if len(text) < settings.MIN_TEXT_CHARS_PER_PAGE:
                return (
                    False,
                    [],
                    f"Page {page_num} has no selectable text ({len(text)} chars). Please upload a digital textbook PDF."
                )

            extracted_pages.append({
                "page_number": page_num,
                "text": text,
                "char_count": len(text)
            })

        return True, extracted_pages, ""

    except Exception as e:
        return False, [], f"PDF parsing error: {str(e)}"
