"""Source-only fallback drafts: no invented textbook facts or joke distractors."""
import re
from app.agents.tools import count_words, is_heading_line

STOP = {'chapter', 'topic', 'section', 'part', 'about', 'after', 'again', 'also', 'because', 'before', 'being', 'could', 'does', 'each', 'from', 'have', 'into', 'more', 'most', 'other', 'should', 'some', 'than', 'that', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'under', 'using', 'very', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your'}


def source_questions(pages_map, count, topic_name):
    statements = []
    for page, text in sorted(pages_map.items()):
        for sentence in re.split(r'(?<=[.!?])\s+|\n+', text):
            sentence = sentence.strip()
            if len(sentence.split()) >= 5 and not is_heading_line(sentence) and (page, sentence) not in statements:
                statements.append((page, sentence))
    terms = list(dict.fromkeys(w.lower() for _, text in statements for w in re.findall(r'\b[A-Za-z]{4,}\b', text) if w.lower() not in STOP))
    candidates, seen = [], set()
    # Existing explicit arithmetic exercises are taken first.
    for page, text in statements:
        match = re.search(r'\b(\d+)\s*([+\-*x/])\s*(\d+)\b', text)
        if match:
            from app.agents.tools import calculator
            result = calculator(float(match[1]), match[2], float(match[3]))
            if result.get('success'):
                value = result['result']
                answer = str(int(value)) if value == int(value) else str(value)
                options = [answer] + [str(int(value + offset)) if value + offset == int(value + offset) else str(value + offset) for offset in (-1, 1, 2)]
                candidates.append(dict(question_text=f'Use the example: what is {match[0]}?', options=options, correct_answer=answer,
                                       source_page=page, evidence_quote=text, difficulty='application', hint_text='Follow the operation in the example.', explanation_text=f'{match[0]} = {answer}. {text}'))
    descriptions = []
    for page, sentence in statements:
        subject = re.match(r'^(?:(?:A|An|The)\s+)?([A-Za-z][A-Za-z -]{1,40}?)\s+(has|have|is|are|can|helps?|makes?|forms?|curves?|transfers?|covers?|cover|lay|estimate|measure|repeat|count)\b', sentence, re.I)
        if subject:
            target = subject[1].strip()
            if target.lower() not in STOP:
                descriptions.append((page, sentence, target))
    subject_terms = list(dict.fromkeys(target for _, _, target in descriptions))
    for page, sentence, target in descriptions:
        numbers = set(re.findall(r"\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b", sentence.casefold()))
        potentially_shared = {other for _, fact, other in descriptions if other != target and numbers & set(re.findall(r"\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b", fact.casefold()))}
        pool = [term for term in subject_terms if term.casefold() != target.casefold() and term.casefold() not in sentence.casefold() and term not in potentially_shared]
        distractors = pool[:3]
        if len(distractors) < 2:
            continue
        cloze = re.sub(r'\b' + re.escape(target) + r'\b', '____', sentence, count=1, flags=re.I)
        candidates.append(dict(question_text=f'Which name does our book use here? “{cloze}”',
            options=[target] + distractors, correct_answer=target, source_page=page, evidence_quote=sentence,
            difficulty='medium', hint_text=f'Think about the example on page {page}.', explanation_text=sentence,
            application_text=f'A friend is looking for something that {sentence.split(target, 1)[-1].strip().rstrip(".").lower()}. Which name from the lesson fits?'))
    # For prose without subject/verb definitions, use distinct source sentences and topic terms.
    for page, sentence in statements:
        words = list(dict.fromkeys(w.lower() for w in re.findall(r'\b[A-Za-z]{4,}\b', sentence) if w.lower() not in STOP))
        for word in sorted(words, key=len, reverse=True):
            key = (sentence.casefold(), word)
            if key in seen:
                continue
            seen.add(key)
            distractors = [term for term in terms if term != word and not re.search(r'\b' + re.escape(term) + r'\b', sentence, re.I)][:3]
            if len(distractors) < 2:
                continue
            cloze = re.sub(r'\b' + re.escape(word) + r'\b', '____', sentence, count=1, flags=re.I)
            answer = re.search(r'\b' + re.escape(word) + r'\b', sentence, re.I)[0]
            candidates.append(dict(question_text=f'Which topic word completes the description? “{cloze}”',
                options=[answer] + distractors, correct_answer=answer, source_page=page, evidence_quote=sentence,
                difficulty='medium', hint_text=f'Remember the example on page {page}.', explanation_text=sentence))
    unique = {}
    for question in candidates:
        unique.setdefault(question["question_text"], question)
    candidates = list(unique.values())
    if not candidates:
        # A visible review flag prevents this placeholder from masquerading as verified content.
        page = next(iter(pages_map), 1)
        candidates = [dict(question_text=f'Which source should we use to learn about {topic_name}?', options=[topic_name, 'A different chapter', 'A different subject'], correct_answer=topic_name,
                           source_page=page, evidence_quote=pages_map.get(page, ''), difficulty='easy', hint_text='Read the topic title together.', explanation_text='This source needs a parent to review the lesson before learning.')]
    output = []
    for i in range(count):
        question = dict(candidates[i % len(candidates)])
        question['options'] = list(question['options'])
        shift = i % len(question['options'])
        question['options'] = question['options'][shift:] + question['options'][:shift]
        application = question.pop('application_text', None)
        question['difficulty'] = 'application' if i == count - 1 else 'easy' if i == 0 else 'medium'
        if i == count - 1 and 'Use the example' not in question['question_text']:
            question['question_text'] = application or ('Help a friend explain the example. ' + question['question_text'])
        output.append(question)
    return output


def source_scenes(pages_map, scene_count):
    # Balance whole sentences; narration must never start or finish with half a thought.
    sentences = [(page, sentence.strip()) for page, text in sorted(pages_map.items())
                 for sentence in re.split(r'(?<=[.!?])\s+|\n+', text) if sentence.strip()]
    target = max(1, sum(count_words(sentence) for _, sentence in sentences) / scene_count)
    output, position = [], 0
    for i in range(scene_count):
        part, words = [], 0
        while position < len(sentences):
            if part and words >= target and len(sentences) - position >= scene_count - i - 1:
                break
            if part and len(sentences) - position <= scene_count - i - 1:
                break
            part.append(sentences[position]); words += count_words(sentences[position][1]); position += 1
        if not part:
            part = sentences[-1:] or [(next(iter(pages_map), 1), 'Let’s read the topic source together and explore its examples.')]
        output.append((part[0][0], ' '.join(sentence for _, sentence in part)))
    if position < len(sentences):
        output[-1] = (output[-1][0], output[-1][1] + ' ' + ' '.join(sentence for _, sentence in sentences[position:]))
    return output
