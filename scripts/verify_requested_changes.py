"""Run the actual agents with a fake model, leaving a separate preview DB and report.
Usage: venv/Scripts/python.exe scripts/verify_requested_changes.py [--serve]
"""
import asyncio
import json
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.config import settings
import app.db as database

OUTPUT = ROOT / 'local_storage' / 'verification'
OUTPUT.mkdir(parents=True, exist_ok=True)
database.DB_FILE = str(OUTPUT / 'preview.db')
settings.STORAGE_LOCAL_DIR = str(OUTPUT / 'storage')
settings.GROQ_API_KEY = ''
settings.GEMINI_API_KEY = ''
settings.SUPABASE_URL = ''
settings.SUPABASE_SERVICE_KEY = ''

from app.main import app
from httpx import AsyncClient, ASGITransport
from app.agents.chunking_agent import run_textbook_chunking_agent
from app.agents.lesson_revision_agent import run_lesson_and_revision_agent, build_deterministic_lesson
from app.agents.quiz_agent import run_quiz_agent, build_deterministic_quizzes
from app.agents.tools import count_words
from app.agents.topic_source import get_topic_pages
from app.agents.loop import llm_service


def sample_pages(large=False):
    if not large:
        statements = [
            'A triangle has three straight sides. A square has four equal sides. A rectangle has four straight sides. A circle has a curved boundary.',
            'A cube has six square faces. A ball has a curved surface. A box has flat faces. A cone has one circular base.',
            'Repeated shapes make a pattern. Floor tiles can make repeating designs. Matching edges fit together. Curved boundaries turn smoothly.',
            'We count sides to identify a polygon. Straight edges meet at vertices. Squares and rectangles have four vertices. Triangles have three vertices.'
        ]
        return [{'page_number':i+1,'text':('Chapter 1: Shapes and Space\n' if i==0 else '') + (text+' ')*4} for i,text in enumerate(statements)]
    titles = ['Brick Patterns','Floor Designs','Building Arches','Measuring Walls','Estimating Materials']
    statements = [
        'Masons lay bricks in alternating rows. Alternating rows help spread a wall load. Jali screens have repeated openings. Brick patterns repeat horizontal and vertical shapes.',
        'Square tiles cover a floor without gaps. Circular floor patterns have a centre. Matching tile edges make a repeating design. We can count tiles in rows.',
        'An arch curves above an opening. Wedge shaped stones support an arch. The arch transfers weight to the columns beside it. The two sides balance the load.',
        'We measure the length of a wall. A metre is a unit of length. Equal units let us compare measurements. A ruler helps measure short edges accurately.',
        'Builders estimate materials before construction. Counting bricks in one row helps count several rows. Equal rows have the same number of bricks. Measurements help plan materials.'
    ]
    pages=[]
    for section,title in enumerate(titles):
        for part in range(6):
            prefix=('Chapter 1: Building with Bricks\n' if section==0 and part==0 else '')
            if part==0: prefix+=f'Topic {section+1}: {title}\n'
            if part==2: prefix+='Worked Example: A builder follows this method.\n'
            pages.append({'page_number':len(pages)+1,'text':prefix+(statements[section]+' ')*7})
    return pages


async def build_preview():
    await database.init_db()
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
        email='preview.dotlink@example.com'
        response=await client.post('/auth/signup',json={'name':'Preview Parent','email':email,'password':'PreviewOnly123!','consent_given':True})
        if response.status_code != 200:
            response=await client.post('/auth/login',json={'email':email,'password':'PreviewOnly123!'})
        response.raise_for_status()
        parent_id=response.json()['user']['id']
        headers={'Authorization':'Bearer '+response.json()['access_token']}
        children=(await client.get('/children',headers=headers)).json()
        if not children:
            child=(await client.post('/children',headers=headers,json={'name':'Preview Explorer','age':9,'grade':4,'mascot_name':'Luna'})).json()
        else: child=children[0]
    db=await database.get_db()
    summary=[]
    try:
        for large in (False,True):
            pages=sample_pages(large)
            title='Building with Bricks' if large else 'Shapes and Space'
            textbook_id=str(uuid.uuid4())
            await db.execute("INSERT INTO textbooks (id,parent_id,grade,subject_tag,title,ncert_code,page_count) VALUES (?,?,4,'Maths',?,'verification',?)",(textbook_id,parent_id,title,len(pages)))
            await db.executemany('INSERT INTO source_pages (id,textbook_id,page_number,text) VALUES (?,?,?,?)',[(str(uuid.uuid4()),textbook_id,p['page_number'],p['text']) for p in pages])
            await db.commit()
            result=await run_textbook_chunking_agent(textbook_id,4,'Maths',db)
            section_summary=[]
            for topic in result['topics']:
                row=await (await db.execute('SELECT * FROM topics WHERE id = ?', (topic['id'],))).fetchone()
                source=await get_topic_pages(db,row)
                wc=count_words('\n'.join(source.values()))
                lesson=build_deterministic_lesson(topic['name'],'Maths',topic['start_page'],topic['end_page'],wc,source)
                quizzes=build_deterministic_quizzes(topic['name'],topic['start_page'],topic['end_page'],source)
                async def fake_model(weight,messages,definitions,lesson=lesson,quizzes=quizzes):
                    name=definitions[-1]['function']['name']
                    payload=lesson if name=='submit_lesson_and_revision' else quizzes
                    return {'content':None,'tool_calls':[{'id':str(uuid.uuid4()),'function':{'name':name,'arguments':json.dumps(payload.model_dump())}}]}
                original=llm_service.chat_with_tools
                llm_service.chat_with_tools=fake_model
                settings.GROQ_API_KEY='fake-model'
                try:
                    await run_lesson_and_revision_agent(topic['id'],str(uuid.uuid4()),db)
                    await run_quiz_agent(topic['id'],str(uuid.uuid4()),db)
                finally:
                    llm_service.chat_with_tools=original
                    settings.GROQ_API_KEY=''
                await db.execute("UPDATE topics SET status='needs_review' WHERE id=?",(topic['id'],))
                await db.commit()
                flagged = (await (await db.execute('SELECT COUNT(*) as n FROM questions WHERE topic_id = ? AND flagged = 1', (topic['id'],))).fetchone())['n']
                section_summary.append({'flagged_questions':flagged,'id':topic['id'],'title':topic['name'],'words':wc,'questions':len(lesson.in_video_questions),'scenes':len(lesson.scenes),'pages':[topic['start_page'],topic['end_page']]})
            trace=(await (await db.execute("SELECT result_summary FROM agent_steps WHERE topic_id=? AND tool_name='topic_source'",(result['topics'][0]['id'],))).fetchone())['result_summary']
            summary.append({'chapter':title,'page_count':len(pages),'trace':trace,'topics':section_summary})
        (OUTPUT/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
        print(json.dumps(summary,indent=2))
        print('Preview login: preview.dotlink@example.com / PreviewOnly123!')
    finally:
        await db.close()


if __name__=='__main__':
    if '--serve' in sys.argv:
        import uvicorn
        uvicorn.run(app,host='127.0.0.1',port=8001)
    else:
        asyncio.run(build_preview())
