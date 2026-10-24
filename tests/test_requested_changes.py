import json
import uuid
from unittest.mock import AsyncMock
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.config import settings
from app.db import init_db, get_db
from app.agents.chunking_agent import run_textbook_chunking_agent
from app.agents.lesson_revision_agent import run_lesson_and_revision_agent, build_deterministic_lesson
from app.agents.topic_source import get_topic_pages
from app.agents.validators import validate_question_with_retry_and_flag, validate_topic_questions
from app.routers.play import get_child_topics_with_lock_state


async def seed(pages, chapter_title='Patterns'):
    await init_db()
    db = await get_db()
    parent_id, child_id, textbook_id = [str(uuid.uuid4()) for _ in range(3)]
    await db.execute("INSERT INTO profiles (id,name,email,consent_given) VALUES (?, 'Parent', ?, 1)", (parent_id, f'{parent_id}@test.example'))
    await db.execute("INSERT INTO children (id,parent_id,name,age,grade,mascot_name) VALUES (?,?,'Child',9,4,'Luna')", (child_id,parent_id))
    await db.execute("INSERT INTO textbooks (id,parent_id,grade,subject_tag,title,ncert_code,page_count) VALUES (?,?,4,'Maths',?,'fake',?)", (textbook_id,parent_id,chapter_title,len(pages)))
    await db.executemany("INSERT INTO source_pages (id,textbook_id,page_number,text) VALUES (?,?,?,?)", [(str(uuid.uuid4()),textbook_id,p['page_number'],p['text']) for p in pages])
    await db.commit()
    return db, parent_id, child_id, textbook_id


@pytest.mark.asyncio
@pytest.mark.parametrize('invalid', ['two', 'none', 'count'])
async def test_fake_model_retries_twice_then_flags(monkeypatch, invalid):
    page = 'Bricks make sturdy arches. Curved stones support the wall. Square tiles form repeating patterns. A circle has a curved boundary.'
    pages = [{'page_number':1,'text':page}]
    db, parent_id, child_id, textbook_id = await seed(pages)
    try:
        chunks = await run_textbook_chunking_agent(textbook_id,4,'Maths',db)
        topic = chunks['topics'][0]
        from app.agents.tools import count_words
        payload = build_deterministic_lesson('Patterns','Maths',1,1,count_words(page),{1:page}).model_dump()
        if invalid == 'two':
            question = payload['in_video_questions'][0]
            question['options'] = [question['correct_answer'],question['correct_answer'],'tiles']
        elif invalid == 'none':
            payload['in_video_questions'][0]['correct_answer'] = 'missing answer'
        else:
            payload['in_video_questions'] = payload['in_video_questions'][:1]
        fake = AsyncMock(return_value={'content':None,'tool_calls':[{'id':'fake-submit','function':{'name':'submit_lesson_and_revision','arguments':json.dumps(payload)}}]})
        monkeypatch.setattr(settings,'GROQ_API_KEY','fake-model')
        monkeypatch.setattr('app.agents.loop.llm_service.chat_with_tools',fake)
        await run_lesson_and_revision_agent(topic['id'],str(uuid.uuid4()),db)
        assert fake.await_count == settings.QUESTION_RETRY_CAP + 1
        rows = await (await db.execute('SELECT flagged,flag_reason FROM questions WHERE topic_id = ?', (topic['id'],))).fetchall()
        assert rows and all(row['flagged'] for row in rows)
        assert any('flag_for_parent' in row['flag_reason'] for row in rows)
    finally:
        await db.close()


@pytest.mark.asyncio
async def test_original_approved_topic_visible_while_neighbours_are_unfinished():
    first = 'Chapter 1: Patterns\nTopic 1: Curved Arches\n' + ('Curved stones carry the arch load safely. ' * 190)
    second = '\nTopic 2: Square Tiles\n' + ('Square tiles form repeating floor designs. ' * 220)
    pages = [{'page_number': 1, 'text': first + second}] + [{'page_number': i, 'text': ''} for i in range(2, 8)]
    db, parent_id, child_id, textbook_id = await seed(pages)
    try:
        result = await run_textbook_chunking_agent(textbook_id, 4, 'Maths', db)
        ready, pending = result['topics']
        await db.execute("UPDATE topics SET status='approved' WHERE id=?", (ready['id'],))
        await db.commit()
        live = await get_child_topics_with_lock_state(child_id, db, parent_id)
        assert [topic['id'] for topic in live] == [ready['id']]
        assert live[0]['is_unlocked']
        # A generated neighbour awaiting parent review must not hide the ready lesson.
        await db.execute("UPDATE topics SET status='needs_review' WHERE id=?", (pending['id'],))
        await db.commit()
        live = await get_child_topics_with_lock_state(child_id, db, parent_id)
        assert [topic['id'] for topic in live] == [ready['id']]
        assert await get_child_topics_with_lock_state(child_id, db, str(uuid.uuid4())) == []
    finally:
        await db.close()


@pytest.mark.asyncio
async def test_generated_lesson_visible_as_pending_and_playable_only_after_approval():
    from app.agents.quiz_agent import run_quiz_agent
    from app.deps import get_current_parent
    text = 'Chapter 1: Shapes\nA triangle has three straight sides. A square has four equal sides. A rectangle has four straight sides. A circle has a curved boundary. A cube has six faces. A cone has one circular base.'
    db, parent_id, child_id, textbook_id = await seed([{'page_number': 1, 'text': text}])
    try:
        result = await run_textbook_chunking_agent(textbook_id, 4, 'Maths', db)
        topic_id = result['topics'][0]['id']
        await run_lesson_and_revision_agent(topic_id, str(uuid.uuid4()), db)
        await run_quiz_agent(topic_id, str(uuid.uuid4()), db)
        await db.execute("UPDATE topics SET status='needs_review' WHERE id=?", (topic_id,))
        await db.commit()
        app.dependency_overrides[get_current_parent] = lambda: {'id': parent_id}
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            before = (await client.get(f'/play/topics/{child_id}')).json()
            assert before['topics'] == []
            assert [item['id'] for item in before['pending_lessons']] == [topic_id]
            assert before['pending_lessons'][0]['is_pending_review']
            assert not before['pending_lessons'][0]['is_unlocked']
            assert 'questions' not in before['pending_lessons'][0]
            blocked = await client.post('/sessions/start-or-resume', json={'child_id': child_id, 'topic_id': topic_id})
            assert blocked.status_code == 400
            approved = await client.post(f'/topics/{topic_id}/approve')
            assert approved.status_code == 200
            after = (await client.get(f'/play/topics/{child_id}')).json()
            assert [item['id'] for item in after['topics']] == [topic_id]
            assert after['pending_lessons'] == []
    finally:
        app.dependency_overrides.clear()
        await db.close()


@pytest.mark.asyncio
async def test_exact_topic_source_and_version_stays_live_until_all_approved():
    from app.agents.tools import split_sections
    # Both topics share page 1. Their snapshots must not include each other's text.
    first = 'Chapter 1: Patterns\nTopic 1: Curved Arches\n' + ('Curved stones carry the arch load safely. ' * 190)
    second = '\nTopic 2: Square Tiles\n' + ('Square tiles form repeating floor designs. ' * 220)
    pages = [{'page_number':1,'text':first+second}] + [{'page_number':i,'text':''} for i in range(2,8)]
    db, parent_id, child_id, textbook_id = await seed(pages)
    try:
        first_run = await run_textbook_chunking_agent(textbook_id,4,'Maths',db)
        assert len(first_run['topics']) == 2
        for topic in first_run['topics']:
            row = await (await db.execute('SELECT * FROM topics WHERE id = ?', (topic['id'],))).fetchone()
            source = await get_topic_pages(db,row)
            if 'Curved' in topic['name']:
                assert 'Square tiles' not in source[1]
            else:
                assert 'Curved stones' not in source[1]
        await db.execute("UPDATE topics SET status = 'approved' WHERE textbook_id = ?", (textbook_id,))
        await db.commit()
        before = [dict(row) for row in await (await db.execute('SELECT * FROM topics WHERE textbook_id = ?', (textbook_id,))).fetchall()]
        second_run = await run_textbook_chunking_agent(textbook_id,4,'Maths',db)
        assert all(topic['version']==2 and topic['status']=='needs_review' for topic in second_run['topics'])
        live = await get_child_topics_with_lock_state(child_id,db,parent_id)
        assert {topic['id'] for topic in live} == {topic['id'] for topic in first_run['topics']}
        # Approving only part of a new chapter keeps the full prior chapter live.
        await db.execute("UPDATE topics SET status = 'approved' WHERE id = ?", (second_run['topics'][0]['id'],))
        await db.commit()
        live = await get_child_topics_with_lock_state(child_id,db,parent_id)
        assert {topic['id'] for topic in live} == {topic['id'] for topic in first_run['topics']}
        await db.execute("UPDATE topics SET status = 'approved' WHERE textbook_id = ? AND version = 2", (textbook_id,))
        await db.commit()
        live = await get_child_topics_with_lock_state(child_id,db,parent_id)
        assert {topic['id'] for topic in live} == {topic['id'] for topic in second_run['topics']}
        for row in before:
            after = dict(await (await db.execute('SELECT * FROM topics WHERE id = ?', (row['id'],))).fetchone())
            assert after == row
    finally:
        await db.close()


@pytest.mark.asyncio
@pytest.mark.parametrize('question_type',['quiz_a','quiz_b','in_video'])
async def test_server_only_second_miss_and_once_per_question(monkeypatch,question_type):
    db,parent_id,child_id,textbook_id = await seed([{'page_number':1,'text':'Chapter 1: Addition\nWe add 3 + 2 to get 5 objects.'}])
    try:
        result = await run_textbook_chunking_agent(textbook_id,4,'Maths',db)
        topic_id=result['topics'][0]['id']
        session_id,question_id=[str(uuid.uuid4()) for _ in range(2)]
        await db.execute("INSERT INTO sessions (id,child_id,topic_id) VALUES (?,?,?)",(session_id,child_id,topic_id))
        await db.execute("INSERT INTO questions (id,topic_id,question_type,question_data,correct_answer,hint_text,explanation_text,source_page) VALUES (?,?,?,?, '5','Count the groups.','3 + 2 = 5.',1)",(question_id,topic_id,question_type,json.dumps({'question_text':'What is 3 + 2?','options':['4','5','6']})))
        await db.commit()
        from app.deps import get_current_parent
        app.dependency_overrides[get_current_parent]=lambda:{'id':parent_id}
        async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
            body={'session_id':session_id,'interaction_type':'answer_submit','question_id':question_id,'selected_answer':'4','time_taken':50,'attempt_number':2}
            # Even a client claiming attempt 2 cannot open it on the first actual miss.
            first=(await client.post('/api/adaptive/interact',json=body)).json()
            assert first['result']=='answer' and first['remediation'] is None
            second=(await client.post('/api/adaptive/interact',json=body)).json()
            assert second['result']=='breakdown'
            assert second['highlightOptionId']==f'{question_id}-option-1'
            assert second['remediation']['gameType']=='order_steps'
            assert second['remediation']['problem']=={'a':3,'b':2,'op':'+'}
            assert second['explanation_text']=='3 + 2 = 5.'
            third=(await client.post('/api/adaptive/interact',json=body)).json()
            assert third['result']=='answer' and third['remediation'] is None
    finally:
        app.dependency_overrides.clear()
        await db.close()


def test_math_equivalent_options_and_missing_evidence_rejected():
    question={'question_text':'What is 3 + 2?','correct_answer':'5','options':['5','5.0','4'],'source_page':1,'evidence_quote':'3 + 2 = 5'}
    result=validate_question_with_retry_and_flag(question,{1:'3 + 2 = 5'},1,1,2)
    assert not result['valid'] and result['flagged']
    question.update(options=['5','4','6'],evidence_quote=None)
    assert not validate_question_with_retry_and_flag(question,{1:'3 + 2 = 5'},1,1,2)['valid']


@pytest.mark.asyncio
async def test_parent_regeneration_preserves_approved_bundle_and_questions():
    from app.agents.quiz_agent import run_quiz_agent
    from app.deps import get_current_parent
    text = 'Chapter 1: Shapes\nA triangle has three straight sides. A square has four equal sides. A rectangle has four straight sides. A circle has a curved boundary. A cube has six faces. A cone has one circular base.'
    db, parent_id, child_id, textbook_id = await seed([{'page_number':1,'text':text}])
    try:
        first = await run_textbook_chunking_agent(textbook_id,4,'Maths',db)
        old_id=first['topics'][0]['id']
        await run_lesson_and_revision_agent(old_id,str(uuid.uuid4()),db)
        await run_quiz_agent(old_id,str(uuid.uuid4()),db)
        await db.execute("UPDATE topics SET status='approved' WHERE id=?",(old_id,))
        await db.commit()
        before_bundle=dict(await (await db.execute('SELECT * FROM lesson_bundles WHERE topic_id=?',(old_id,))).fetchone())
        before_questions=[dict(row) for row in await (await db.execute('SELECT * FROM questions WHERE topic_id=? ORDER BY id',(old_id,))).fetchall()]
        app.dependency_overrides[get_current_parent]=lambda:{'id':parent_id}
        async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
            response=await client.post(f'/topics/{old_id}/generate')
            assert response.status_code==200
            new_id=response.json()['topic_id']
            assert new_id!=old_id
            new_topic=(await client.get(f'/topics/{new_id}')).json()
            assert new_topic['version']==2 and new_topic['status']=='needs_review'
            live=(await client.get(f'/play/topics/{child_id}')).json()['topics']
            assert [topic['id'] for topic in live]==[old_id]
            assert (await client.get(f'/play/topics/{child_id}')).json()['pending_lessons'] == []
            approved=await client.post(f'/topics/{new_id}/approve')
            assert approved.status_code==200
            live=(await client.get(f'/play/topics/{child_id}')).json()['topics']
            assert [topic['id'] for topic in live]==[new_id]
        after_bundle=dict(await (await db.execute('SELECT * FROM lesson_bundles WHERE topic_id=?',(old_id,))).fetchone())
        after_questions=[dict(row) for row in await (await db.execute('SELECT * FROM questions WHERE topic_id=? ORDER BY id',(old_id,))).fetchall()]
        assert before_bundle==after_bundle and before_questions==after_questions
    finally:
        app.dependency_overrides.clear()
        await db.close()
