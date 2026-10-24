import React, { useState, useMemo } from 'react';
import { useRemediationFlow, THEMES } from '../../remediation';
import '../../remediation/remediation.css';

export default function RemediationDev() {
  const [gameType, setGameType] = useState('order_steps'), [theme, setTheme] = useState('dinosaurs');
  const [op, setOp] = useState('+'), [a, setA] = useState(3), [b, setB] = useState(2);
  const [reduceMotion, setReduceMotion] = useState(false), [soundEnabled, setSoundEnabled] = useState(false);
  const [quizSet, setQuizSet] = useState('quiz_a'), [index, setIndex] = useState(0), [phase, setPhase] = useState('question');
  const [misses, setMisses] = useState(0), [status, setStatus] = useState(''), [round, setRound] = useState(0);
  const flow = useRemediationFlow({ reduceMotion, soundEnabled });
  const total = op === '+' ? a + b : Math.max(0, a - b);
  const objectKey = THEMES[theme].primaryObject;
  const config = useMemo(() => ({ gameType, theme, companion: { key: 'luna', name: 'Luna' }, problem: { a, b, op }, objectKey,
    steps: (op === '+' ? ['Count the first group', 'Count the second group', 'Count them all together'] : ['Start with all', 'Take some away', 'Count what is left'])
      .map((label, i) => ({ id: `step-${i}`, label, iconKey: objectKey, animation: 'pop' })),
    pairs: [a, b, total].map((value, i) => ({ id: `pair-${i}`, left: { type: 'numeral', value }, right: { type: 'objects', objectKey, count: value } })),
    voiceLines: { intro: 'Let’s discover the secret steps together!', hint: 'Almost. Let’s try this one.', assist: 'I’ll guide this step right here.', success: 'Nice! Let’s use our new steps.' }
  }), [gameType, theme, a, b, op, total, objectKey]);
  const options = [total + 1, total, total + 2];
  const questionId = `${quizSet}-round-${round}-q${index + 1}`;
  const startBreakdown = (stall = false) => {
    setMisses(2); setStatus(''); setPhase('game');
    flow.triggerRemediation({ result: 'breakdown', remediation: { ...config, simulateStalling: stall }, highlightOptionId: `${questionId}-option-1` },
      () => { setPhase('practice'); setStatus('Let’s try the same question with our new steps.'); }, { sessionId: 'dev', quizSet, questionId });
  };
  const answer = value => {
    if (phase === 'practice') { setPhase('explanation'); setStatus(''); return; }
    if (value === total) { setPhase('explanation'); setStatus('Nice work! You’ve got it!'); }
    else if (misses === 0) { setMisses(1); setStatus('Almost. Use the operation to find the total, then try again.'); }
    else startBreakdown();
  };
  const next = () => { setIndex(value => (value + 1) % 3); if (index === 2) setRound(value => value + 1); setPhase('question'); setMisses(0); setStatus(''); };
  return <div className="remediation-dev"><main>
    <p>DOTLINK · DEVELOPER PREVIEW</p><h1>A little help, a new discovery</h1>
    <p>Preview the same game, reveal, retry and explanation used in a lesson.</p>
    <div className="dev-controls">
      <label>Game<select value={gameType} onChange={e => setGameType(e.target.value)}><option value="order_steps">Secret Steps</option><option value="match_pairs">Match the Numbers</option></select></label>
      <label>Theme<select value={theme} onChange={e => setTheme(e.target.value)}>{Object.values(THEMES).map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label>
      <label>First number<input type="number" min="0" max="10" value={a} onChange={e => setA(Math.max(0, Math.min(10, Number(e.target.value))))} /></label>
      <label>Operation<select value={op} onChange={e => setOp(e.target.value)}><option value="+">+</option><option value="-">−</option></select></label>
      <label>Second number<input type="number" min="0" max={op === '-' ? a : 10} value={b} onChange={e => setB(Math.max(0, Math.min(op === '-' ? a : 10, Number(e.target.value))))} /></label>
      <label>Quiz set<select value={quizSet} onChange={e => { setQuizSet(e.target.value); setIndex(0); setPhase('question'); setMisses(0); setRound(value => value + 1); }}><option value="quiz_a">Set A</option><option value="quiz_b">Set B</option></select></label>
      <label><input type="checkbox" checked={reduceMotion} onChange={e => setReduceMotion(e.target.checked)} />Reduce motion</label>
      <label><input type="checkbox" checked={soundEnabled} onChange={e => setSoundEnabled(e.target.checked)} />Sound</label>
    </div>
    <section className="dev-quiz" inert={flow.isRemediating ? true : undefined} aria-label="Mock quiz">
      <p>Set {quizSet === 'quiz_a' ? 'A' : 'B'} · Question {index + 1} of 3</p>
      <h2>What is {a} {op} {b}?</h2>
      <div className="dev-options">{options.map((value, i) => <button key={i} id={`${questionId}-option-${i}`}
        className={flow.highlightedId === `${questionId}-option-${i}` ? 'aha-glow' : ''}
        disabled={flow.isRemediating || phase === 'explanation'} onClick={() => answer(value)}>{value}</button>)}</div>
      {status && <p role="status">{status}</p>}
      {phase === 'explanation' ? <><div className="dev-explanation"><h3>Let’s look at the explanation</h3><p>{op === '+' ? `Bring ${a} and ${b} together to get ${total}.` : `Start with ${a}, take away ${b}, and ${total} remain.`}</p></div><button className="dev-primary" onClick={next}>Next question →</button></> : <div className="dev-controls">
        <button className="dev-primary" disabled={flow.isRemediating} onClick={() => startBreakdown()}>2nd wrong answer</button>
        <button disabled={flow.isRemediating} onClick={() => startBreakdown(true)}>Simulate stalling</button>
      </div>}
    </section>
    {flow.remediationPopup}
  </main></div>;
}
