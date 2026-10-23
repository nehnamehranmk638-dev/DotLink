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
        res_topics = await client.get(f"/textbooks/{textbook_id}/topics", headers=headers)
        assert res_topics.status_code == 200
        topics_list = res_topics.json()
        assert len(topics_list) == len(data["topics"])
        assert topics_list[0]["subject_tag"] == "Science"
