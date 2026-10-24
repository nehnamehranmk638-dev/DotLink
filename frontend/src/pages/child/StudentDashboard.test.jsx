import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { api } from '../../api';
import StudentDashboard from './StudentDashboard';

const child = { id: 'learner-1', name: 'Learner', grade: 4 };
const topic = { id: 'ready-1', name: 'Curved Arches', chapter_title: 'Building with Bricks',
  chapter_number: 1, topic_number: 1, textbook_title: 'Maths', status: 'approved',
  subject_tag: 'Maths', start_page: 1, end_page: 6, is_unlocked: true };
beforeEach(() => {
  vi.spyOn(api, 'getActiveChild').mockReturnValue(child);
  vi.spyOn(api, 'getChildren').mockResolvedValue([child]);
  vi.spyOn(api, 'getPlayTopics').mockResolvedValue({ topics: [topic] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('displays an approved lesson and opens its session', async () => {
  vi.spyOn(api, 'startOrResumeSession').mockResolvedValue({ session_id: 'lesson-session' });
  render(<MemoryRouter initialEntries={['/play']}><Routes>
    <Route path="/play" element={<StudentDashboard />} />
    <Route path="/play/session/:id" element={<p>Animated lesson opened</p>} />
  </Routes></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: /Curved Arches/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Start Animated Lesson/ }));
  expect(await screen.findByText('Animated lesson opened')).toBeInTheDocument();
  expect(api.startOrResumeSession).toHaveBeenCalledWith(child.id, topic.id);
});

it('shows a loading error instead of an empty library and recovers on retry', async () => {
  api.getPlayTopics.mockRejectedValueOnce(new Error('Connection interrupted'));
  render(<MemoryRouter><StudentDashboard /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');
  expect(screen.queryByText('No Approved Lessons Available Yet')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try loading lessons again' }));
  expect(await screen.findByRole('heading', { name: /Curved Arches/ })).toBeInTheDocument();
});

it('explains parent approval when no playable lessons are available', async () => {
  api.getPlayTopics.mockResolvedValue({ topics: [] });
  render(<MemoryRouter><StudentDashboard /></MemoryRouter>);
  expect(await screen.findByText('No Approved Lessons Available Yet')).toBeInTheDocument();
  expect(screen.getByText(/Lessons awaiting review appear here after parent approval/)).toBeInTheDocument();
});

it('shows a generated lesson awaiting review and refreshes when it is approved', async () => {
  api.getPlayTopics.mockResolvedValue({ topics: [], pending_lessons: [
    { ...topic, is_unlocked: false, is_pending_review: true, status: 'needs_review' }
  ] });
  render(<MemoryRouter><StudentDashboard /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: /Curved Arches/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Waiting for parent approval' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /Start Animated Lesson/ })).not.toBeInTheDocument();
  expect(screen.queryByText('No Approved Lessons Available Yet')).not.toBeInTheDocument();
  api.getPlayTopics.mockResolvedValue({ topics: [topic], pending_lessons: [] });
  fireEvent(window, new Event('focus'));
  expect(await screen.findByRole('button', { name: /Start Animated Lesson/ })).toBeEnabled();
  expect(screen.queryByText('Waiting for parent approval')).not.toBeInTheDocument();
});
