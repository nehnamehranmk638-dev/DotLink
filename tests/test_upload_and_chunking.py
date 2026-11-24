import io
import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from pypdf import PdfReader, PdfWriter
from app.main import app
from app.db import init_db

@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()

def create_test_pdf(num_pages=4, text_content="Chapter 1: Brick Patterns and Structural Geometry in Architecture"):
    base_pdf = b"""%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 85>>stream
BT
/F1 12 Tf
72 712 Td
(""" + text_content.encode("latin-1") + b""") Tj
ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000056 00000 n 
0000000111 00000 n 
0000000234 00000 n 
0000000356 00000 n 
trailer<</Size 6/Root 1 0 R>>
startxref
424
%%EOF
"""
    reader = PdfReader(io.BytesIO(base_pdf))
    writer = PdfWriter()
    for _ in range(num_pages):
        writer.add_page(reader.pages[0])
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()

def create_blank_pdf():
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()

@pytest.mark.asyncio
async def test_upload_missing_or_empty_file():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Signup
        signup_res = await client.post("/auth/signup", json={
            "name": "Upload Tester",
            "email": f"upload_test_{uuid.uuid4().hex[:6]}@example.com",
            "password": "securepassword123",
            "consent_given": True
        })
        token = signup_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Empty file content
        res = await client.post(
            "/curriculum/upload-textbook",
            data={"grade": 4, "subject_tag": "Maths"},
            files={"file": ("empty.pdf", b"", "application/pdf")},
            headers=headers
        )
        assert res.status_code == 400
        assert "empty" in res.json()["detail"].lower()

@pytest.mark.asyncio
async def test_upload_non_selectable_text_fails():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        signup_res = await client.post("/auth/signup", json={
            "name": "Scan Tester",
            "email": f"scan_test_{uuid.uuid4().hex[:6]}@example.com",
            "password": "securepassword123",
            "consent_given": True
        })
        token = signup_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        blank_pdf = create_blank_pdf()
        res = await client.post(
            "/curriculum/upload-textbook",
            data={"grade": 4, "subject_tag": "Science"},
            files={"file": ("scanned_blank.pdf", blank_pdf, "application/pdf")},
            headers=headers
        )
        assert res.status_code == 400
        assert "no_selectable_text" in res.json()["detail"]

@pytest.mark.asyncio
async def test_upload_and_hierarchical_chunking_success():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        signup_res = await client.post("/auth/signup", json={
            "name": "Hierarchy Tester",
            "email": f"hierarchy_{uuid.uuid4().hex[:6]}@example.com",
            "password": "securepassword123",
            "consent_given": True
        })
        token = signup_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create valid PDF
        pdf_bytes = create_test_pdf(num_pages=4, text_content="Chapter 1: Understanding Living and Non-Living Systems")
        res = await client.post(
            "/curriculum/upload-textbook",
            data={"grade": 4, "subject_tag": "Science", "title": "Science Discoveries Grade 4"},
            files={"file": ("science_ch1.pdf", pdf_bytes, "application/pdf")},
            headers=headers
        )
        assert res.status_code == 200
        data = res.json()
        assert "textbook_id" in data
        assert data["subject_tag"] == "Science"
        assert len(data["topics"]) >= 1

        first_topic = data["topics"][0]
        assert first_topic["status"] == "chunked"
        assert "chapter_number" in first_topic
        assert "chapter_title" in first_topic
        assert "topic_number" in first_topic
        assert first_topic["start_page"] <= first_topic["end_page"]

        # Verify listing topics for this textbook
        textbook_id = data["textbook_id"]
        res_books = await client.get("/textbooks", headers=headers)
        assert res_books.status_code == 200
        uploaded_book = next(book for book in res_books.json() if book["id"] == textbook_id)
        assert uploaded_book["title"] == "Science Discoveries Grade 4"
        assert uploaded_book["page_count"] == 4

        res_topics = await client.get(f"/textbooks/{textbook_id}/topics", headers=headers)
        assert res_topics.status_code == 200
        topics_list = res_topics.json()
        assert len(topics_list) == len(data["topics"])
        assert topics_list[0]["subject_tag"] == "Science"

        trace = await client.get(f"/topics/{topics_list[0]['id']}/agent-steps", headers=headers)
        assert trace.status_code == 200
        assert trace.json()

@pytest.mark.asyncio
async def test_generic_filename_extracts_real_heading_from_content(monkeypatch):
    """
    BUG 1 Fix Assertion: When uploaded file has a non-descriptive filename (e.g. desa101.pdf),
    the system must extract the title, grade, and subject from content and running headers,
    never falling back to the filename, and keeping flagged=False.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        signup_res = await client.post("/auth/signup", json={
            "name": "Generic Filename Tester",
            "email": f"generic_{uuid.uuid4().hex[:6]}@example.com",
            "password": "securepassword123",
            "consent_given": True
        })
        token = signup_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Mock extract_pdf_pages to return real NCERT page text with running header & unit heading
        mock_pages = [
            {"page_number": 1, "text": "Santoor | Grade 4\nUnit 1: My Land\n1. Together We Can\nTogether we can build a world so bright..."},
            {"page_number": 2, "text": "Santoor | Grade 4\nLet us Recite\nWe can lend a helping hand to all our friends."},
            {"page_number": 3, "text": "Santoor | Grade 4\nLet us Think\nWhat can we do together?"}
        ]
        monkeypatch.setattr("app.routers.curriculum.extract_pdf_pages", lambda bytes: mock_pages)

        # Upload with generic filename "desa101.pdf" and no title parameter
        dummy_pdf = create_test_pdf(num_pages=3)
        res = await client.post(
            "/curriculum/upload-textbook",
            data={"subject_tag": "English"},
            files={"file": ("desa101.pdf", dummy_pdf, "application/pdf")},
            headers=headers
        )
        assert res.status_code == 200
        data = res.json()

        # Assert stored textbook title comes from content ("Together We Can"), NOT filename "Desa101"
        assert data["title"] == "Together We Can"
        assert data["title"].lower() != "desa101"

        # Assert topics got created with content-derived heading and flagged=0
        assert len(data["topics"]) >= 1
        first_topic = data["topics"][0]
        assert first_topic["chapter_title"] == "Together We Can"
        assert first_topic.get("flagged") is False
        assert first_topic.get("flag_reason") is None

        # Verify textbook row in DB
        res_books = await client.get("/textbooks", headers=headers)
        uploaded_book = next(b for b in res_books.json() if b["id"] == data["textbook_id"])
        assert uploaded_book["title"] == "Together We Can"

@pytest.mark.asyncio
async def test_no_usable_heading_falls_back_to_filename_and_flags(monkeypatch):
    """
    BUG 1 Fix Assertion: If and only if no usable heading can be extracted from content,
    fallback to filename but FLAG the topic with flagged=1 and flag_reason set.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        signup_res = await client.post("/auth/signup", json={
            "name": "Fallback Flag Tester",
            "email": f"fallback_{uuid.uuid4().hex[:6]}@example.com",
            "password": "securepassword123",
            "consent_given": True
        })
        token = signup_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Content with no headings or chapter markers at all
        mock_pages = [
            {"page_number": 1, "text": "plain unstructured text without any heading or chapter marker."},
            {"page_number": 2, "text": "second page continuing without headings or numbers."}
        ]
        monkeypatch.setattr("app.routers.curriculum.extract_pdf_pages", lambda bytes: mock_pages)

        dummy_pdf = create_test_pdf(num_pages=2)
        res = await client.post(
            "/curriculum/upload-textbook",
            data={"subject_tag": "Science"},
            files={"file": ("unnamed_notes_99.pdf", dummy_pdf, "application/pdf")},
            headers=headers
        )
        assert res.status_code == 200
        data = res.json()

        # Assert fallback was used and topic is FLAGGED for parent review
        assert len(data["topics"]) >= 1
        for topic in data["topics"]:
            assert topic["flagged"] is True
            assert topic["flag_reason"] == "Title could not be extracted from content — used filename, please verify"
