import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RemediationDev from '../../pages/dev/RemediationDev';
import RemediationGame from '../RemediationGame';
import QuizView from '../../pages/child/QuizView';
import StudentInactivity from '../../components/StudentInactivity';
import { MOCK_CONFIGS } from '../mockConfigs';
import { api } from '../../api';

const advance = async ms => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Complete remediation flow', () => {
  it.each(['quiz_a', 'quiz_b'])('plays game, Aha, same question, explanation, next question for %s', async quizSet => {
    vi.useFakeTimers();
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true });
    render(<RemediationDev />);
    fireEvent.change(screen.getByLabelText('Quiz set'), { target: { value: quizSet } });
    fireEvent.click(screen.getByText('Simulate stalling'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Mock quiz' })).toHaveAttribute('inert');
    await advance(1001); // assistance
    await advance(1400); // concrete object demonstration
    await advance(1001); // completion
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(document.querySelector('.aha-glow')).toBeInTheDocument();
    await advance(3001);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Let’s try the same question with our new steps.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('5', { selector: 'button' }));
    expect(screen.getByText('Let’s look at the explanation')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next question →'));
    expect(screen.getByText(/Question 2 of 3/)).toBeInTheDocument();
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.quiz_set).toBe(quizSet);
    expect(payload.question_id).toContain('q1');
    expect(payload.assisted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('real quiz pauses timers and uses only the server breakdown response', async () => {
    vi.useFakeTimers();
    vi.spyOn(api, 'getQuizQuestions').mockResolvedValue([
      { id:'q1', question_text:'What is 3 + 2?', options:['4','5','6'], correct_answer:'5', explanation_text:'3 + 2 = 5.' },
      { id:'q2', question_text:'What is 2 + 2?', options:['3','4','5'], correct_answer:'4', explanation_text:'2 + 2 = 4.' }
    ]);
    const interact = vi.spyOn(api, 'adaptiveInteract')
      .mockResolvedValueOnce({ result:'answer', is_correct:false, can_retry:true, hint_text:'Count the groups.' })
      .mockResolvedValueOnce({ result:'breakdown', is_correct:false, remediation:{ ...MOCK_CONFIGS[0], simulateStalling:true }, highlightOptionId:'q1-option-1', explanation_text:'3 + 2 = 5.' })
      .mockResolvedValueOnce({ result:'answer', is_correct:true });
    vi.spyOn(globalThis,'fetch').mockResolvedValue({ ok:true });
    render(<MemoryRouter initialEntries={['/play/quiz/test-session']}><Routes><Route path="/play/quiz/:sessionId" element={<QuizView />} /></Routes></MemoryRouter>);
    await advance(10); await advance(3500);
    fireEvent.click(screen.getByText('4', { selector:'button' }));
    await advance(10);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/Count the groups/)).toBeInTheDocument();
    await advance(2500);
    fireEvent.click(screen.getByText('4', { selector:'button' }));
    await advance(10);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await advance(1001); await advance(1400); await advance(1001); await advance(3001);
    await advance(2500);
    fireEvent.click(screen.getByText('5', { selector:'button' }));
    expect(screen.getByText(/3 \+ 2 = 5\./)).toBeInTheDocument();
    expect(interact).toHaveBeenCalledTimes(2); // practice is ungraded
    fireEvent.click(screen.getByText('Continue →'));
    await advance(3500);
    fireEvent.click(screen.getByText('4', { selector:'button' }));
    await advance(10);
    expect(interact).toHaveBeenCalledTimes(3);
    expect(interact.mock.calls[2][0].time_taken).toBeLessThan(2);
  });
});

describe('Popup accessibility and input', () => {
  it('traps keyboard focus and returns focus to the quiz on unmount', () => {
    const host = document.createElement('button'); document.body.append(host); host.focus();
    const { unmount } = render(<RemediationGame config={MOCK_CONFIGS[0]} />);
    const dialog = screen.getByRole('dialog'); expect(dialog).toHaveFocus();
    const controls = [...dialog.querySelectorAll('[tabindex="0"]')];
    controls.at(-1).focus(); fireEvent.keyDown(controls.at(-1), { key:'Tab' }); expect(controls[0]).toHaveFocus();
    fireEvent.keyDown(controls[0], { key:'Tab', shiftKey:true }); expect(controls.at(-1)).toHaveFocus();
    unmount(); expect(host).toHaveFocus(); host.remove();
  });
  it('supports touch pointer dragging as well as tapping and keyboard input', () => {
    window.PointerEvent = MouseEvent;
    const { container } = render(<RemediationGame config={MOCK_CONFIGS[0]} />);
    const card = screen.getByLabelText(/Step card: Count first/);
    const slot = screen.getByLabelText(/Slot 1, empty/);
    document.elementFromPoint = vi.fn(() => slot);
    fireEvent.pointerDown(card, { button:0, clientX:10, clientY:10, pointerId:1 });
    fireEvent.pointerMove(card, { clientX:110, clientY:110, pointerId:1 });
    fireEvent.pointerUp(card, { clientX:110, clientY:110, pointerId:1 });
    expect(screen.getByLabelText(/Slot 1: contains Count first/)).toBeInTheDocument();
    expect(container.querySelectorAll('[role="button"]').length).toBeGreaterThan(0);
  });
  it('honours the system reduced-motion preference even when app setting is false', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches:true, addEventListener:vi.fn(), removeEventListener:vi.fn() }));
    render(<RemediationGame config={MOCK_CONFIGS[0]} reduceMotion={false} />);
    expect(screen.getByRole('dialog')).toHaveClass('reduce-motion');
  });
  it('soft-finishes both games before thirty seconds without an input', async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const { unmount } = render(<RemediationGame config={MOCK_CONFIGS[0]} onComplete={done} />);
    await advance(24001); await advance(1400); await advance(1001);
    expect(done).toHaveBeenCalledTimes(1); expect(done.mock.calls[0][0].durationMs).toBeLessThan(30000);
    unmount(); done.mockClear();
    render(<RemediationGame config={MOCK_CONFIGS[3]} onComplete={done} />);
    await advance(28001); await advance(1001);
    expect(done).toHaveBeenCalledTimes(1); expect(done.mock.calls[0][0].assisted).toBe(true);
  });
});

it('checks in at thirty seconds and pauses until the child responds', async () => {
  vi.useFakeTimers(); const pause = vi.fn(), resume = vi.fn();
  render(<StudentInactivity onPause={pause} onResume={resume} />);
  await advance(29999); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await advance(251); expect(screen.getByText('Are you there?')).toBeInTheDocument(); expect(pause).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByText('I’m here. Let’s continue!')); expect(resume).toHaveBeenCalledOnce();
});
