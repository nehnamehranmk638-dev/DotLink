import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Curriculum from './Curriculum';
import { api } from '../../api';

vi.mock('animejs', () => ({
  animate: (_target, options) => { if (options.onComplete) queueMicrotask(options.onComplete); },
  createTimeline: (options) => {
    queueMicrotask(options.onComplete);
    const timeline = { add: () => timeline };
    return timeline;
  }
}));

const topic = { id: 'topic-1', chapter_number: 1, chapter_title: 'Shapes and Space',
  topic_number: 1, name: 'Recognising shapes', start_page: 1, end_page: 4, status: 'chunked' };
const book = { id: 'book-1', title: 'My Shapes', subject_tag: 'Maths', grade: 4 };

beforeEach(() => {
  vi.spyOn(api, 'getActiveChild').mockReturnValue({ id: 'child-1', name: 'Learner', grade: 4 });
  vi.spyOn(api, 'getChildren').mockResolvedValue([]);
  vi.spyOn(api, 'getTextbooks').mockResolvedValue([]);
  vi.spyOn(api, 'getTopics').mockResolvedValue([topic]);
  vi.spyOn(api, 'uploadAndChunkTextbook').mockResolvedValue({ textbook_id: book.id,
    title: book.title, subject_tag: book.subject_tag,
    chapters: [{ chapter_number: 1 }], topics: [topic] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Curriculum upload results', () => {
  it('provides a review link for generated lessons awaiting parent approval', async () => {
    api.getTextbooks.mockResolvedValue([book]);
    api.getTopics.mockResolvedValue([{ ...topic, status: 'needs_review' }]);
    render(<MemoryRouter><Curriculum /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Review Lesson', exact: true })).toBeInTheDocument();
    expect(screen.getByText('AWAITING PARENT REVIEW')).toBeInTheDocument();
    expect(screen.queryByText('Ready to Play')).not.toBeInTheDocument();
  });

  it('shows saved textbooks and chapters after upload and after reopening the page', async () => {
    const view = render(<MemoryRouter><Curriculum /></MemoryRouter>);
    await waitFor(() => expect(api.getTextbooks).toHaveBeenCalledTimes(1));
    api.getTextbooks.mockResolvedValue([book]);
    fireEvent.change(screen.getByLabelText('Textbook PDF'), {
      target: { files: [new File(['test pdf'], 'shapes.pdf', { type: 'application/pdf' })] }
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Done', exact: true }));
    expect(await screen.findByText(/Recognising shapes/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Uploaded Textbooks/ })).toBeInTheDocument();
    expect(api.uploadAndChunkTextbook.mock.calls[0][0].get('file').name).toBe('shapes.pdf');
    await waitFor(() => expect(api.getTopics).toHaveBeenCalledWith(book.id));
    view.unmount();
    render(<MemoryRouter><Curriculum /></MemoryRouter>);
    expect(await screen.findByText(/Recognising shapes/)).toBeInTheDocument();
  });

  it('retains uploaded chapters when refresh fails and lets the parent retry', async () => {
    render(<MemoryRouter><Curriculum /></MemoryRouter>);
    await waitFor(() => expect(api.getTextbooks).toHaveBeenCalledTimes(1));
    api.getTextbooks.mockRejectedValue(new Error('Service unavailable'));
    fireEvent.change(screen.getByLabelText('Textbook PDF'), {
      target: { files: [new File(['test pdf'], 'shapes.pdf', { type: 'application/pdf' })] }
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Done', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
    expect(screen.getByText(/Recognising shapes/)).toBeInTheDocument();
    api.getTextbooks.mockResolvedValue([book]);
    fireEvent.click(screen.getByRole('button', { name: 'Try loading again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByText(/Recognising shapes/)).toBeInTheDocument();
  });
});
