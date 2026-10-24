import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

it('loads child lessons from the configured API and surfaces request errors', async () => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:8001');
  vi.resetModules();
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ topics: [{ id: 'ready' }] }) })
    .mockResolvedValueOnce({ ok: false, json: async () => ({ detail: 'Lessons temporarily unavailable' }) });
  vi.stubGlobal('fetch', fetchMock);
  const { api } = await import('./api');
  expect(await api.getPlayTopics('child-1')).toEqual({ topics: [{ id: 'ready' }] });
  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8001/play/topics/child-1');
  await expect(api.getPlayTopics('child-1')).rejects.toThrow('Lessons temporarily unavailable');
});

it('uses the configured API for lesson loading, scene progress and pausing', async () => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:8001');
  vi.resetModules();
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);
  const { api } = await import('./api');
  await api.getSessionDetails('session-1');
  await api.updateSessionScene('session-1', 2);
  await api.pauseSession('session-1', 2);
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    'http://localhost:8001/sessions/session-1/details',
    'http://localhost:8001/sessions/session-1/update-scene',
    'http://localhost:8001/sessions/session-1/pause'
  ]);
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ scene_index: 2 });
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ scene_index: 2 });
});
