// ============================================================================
// Tests: SSE Client (Integration-style)
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSSEClient } from '../../src/core/sse-client.js';
import type { SSEEvent, SSEClientOptions } from '../../src/core/types.js';

// ============================================================================
// Mock fetch for testing
// ============================================================================

function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]!));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

function mockFetchSuccess(chunks: string[], status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    body: createMockStream(chunks),
    headers: new Headers(),
  });
}

function mockFetchError(errorMessage: string) {
  return vi.fn().mockRejectedValue(new Error(errorMessage));
}

describe('createSSEClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Basic Connection
  // =========================================================================
  describe('basic connection', () => {
    it('should receive SSE events through onMessage', async () => {
      const events: SSEEvent[] = [];
      const onClose = vi.fn();

      globalThis.fetch = mockFetchSuccess([
        'data: hello\n\n',
        'data: world\n\n',
      ]) as unknown as typeof fetch;

      const controller = new AbortController();

      createSSEClient({
        url: '/api/stream',
        signal: controller.signal,
        retry: { maxRetries: 0 },
        onMessage(event) {
          events.push(event);
        },
        onClose,
      });

      // Wait for stream to complete
      await vi.waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      }, { timeout: 2000 });

      expect(events).toHaveLength(2);
      expect(events[0]!.data).toBe('hello');
      expect(events[1]!.data).toBe('world');
    });

    it('should call onOpen when connected', async () => {
      const onOpen = vi.fn();
      const onClose = vi.fn();

      globalThis.fetch = mockFetchSuccess([
        'data: test\n\n',
      ]) as unknown as typeof fetch;

      createSSEClient({
        url: '/api/stream',
        signal: new AbortController().signal,
        retry: { maxRetries: 0 },
        onOpen,
        onClose,
        onMessage() {},
      });

      await vi.waitFor(() => {
        expect(onOpen).toHaveBeenCalled();
      }, { timeout: 2000 });
    });

    it('should send correct headers', async () => {
      const onClose = vi.fn();
      const fetchMock = mockFetchSuccess(['data: test\n\n']);
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      createSSEClient({
        url: '/api/stream',
        method: 'POST',
        headers: { 'X-Custom': 'value' },
        body: JSON.stringify({ prompt: 'hello' }),
        signal: new AbortController().signal,
        retry: { maxRetries: 0 },
        onMessage() {},
        onClose,
      });

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      }, { timeout: 2000 });

      const callArgs = fetchMock.mock.calls[0]!;
      expect(callArgs[0]).toBe('/api/stream');
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].headers['Accept']).toBe('text/event-stream');
      expect(callArgs[1].headers['X-Custom']).toBe('value');
    });
  });

  // =========================================================================
  // AbortController
  // =========================================================================
  describe('abort handling', () => {
    it('should stop on abort signal', async () => {
      const events: SSEEvent[] = [];
      const onClose = vi.fn();
      const onOpen = vi.fn();
      const controller = new AbortController();

      // Create a stream that respects the abort signal
      globalThis.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        const signal = init.signal!;
        const encoder = new TextEncoder();

        const stream = new ReadableStream<Uint8Array>({
          start(ctrl) {
            ctrl.enqueue(encoder.encode('data: first\n\n'));
            // Listen for abort to cancel the stream
            signal.addEventListener('abort', () => {
              try { ctrl.close(); } catch { /* already closed */ }
            });
          },
        });

        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          body: stream,
          headers: new Headers(),
        });
      }) as unknown as typeof fetch;

      createSSEClient({
        url: '/api/stream',
        signal: controller.signal,
        retry: { maxRetries: 0 },
        onOpen,
        onMessage(event) {
          events.push(event);
        },
        onClose,
      });

      // Wait for first event
      await vi.waitFor(() => {
        expect(events.length).toBeGreaterThanOrEqual(1);
      }, { timeout: 2000 });

      // Abort
      controller.abort();

      await vi.waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      }, { timeout: 2000 });
    });

    it('should not connect if signal is already aborted', async () => {
      const onClose = vi.fn();
      const controller = new AbortController();
      controller.abort();

      globalThis.fetch = mockFetchSuccess([
        'data: test\n\n',
      ]) as unknown as typeof fetch;

      createSSEClient({
        url: '/api/stream',
        signal: controller.signal,
        retry: { maxRetries: 0 },
        onMessage() {},
        onClose,
      });

      await vi.waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      }, { timeout: 2000 });

      // fetch should not have been called
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Error Handling
  // =========================================================================
  describe('error handling', () => {
    it('should call onError for HTTP errors', async () => {
      const onError = vi.fn();
      const onClose = vi.fn();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        body: null,
        headers: new Headers(),
      }) as unknown as typeof fetch;

      createSSEClient({
        url: '/api/stream',
        signal: new AbortController().signal,
        retry: { maxRetries: 0 },
        onMessage() {},
        onError,
        onClose,
      });

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalled();
      }, { timeout: 2000 });

      const error = onError.mock.calls[0]![0];
      expect(error.statusCode).toBe(500);
    });

    it('should call onError for network errors', async () => {
      const onError = vi.fn();
      const onClose = vi.fn();

      globalThis.fetch = mockFetchError('Network failure') as unknown as typeof fetch;

      createSSEClient({
        url: '/api/stream',
        signal: new AbortController().signal,
        retry: { maxRetries: 0 },
        onMessage() {},
        onError,
        onClose,
      });

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalled();
      }, { timeout: 2000 });
    });
  });

  // =========================================================================
  // Deduplication
  // =========================================================================
  describe('deduplication', () => {
    it('should deduplicate events by ID', async () => {
      const events: SSEEvent[] = [];
      const onClose = vi.fn();

      globalThis.fetch = mockFetchSuccess([
        'id: 1\ndata: first\n\n',
        'id: 1\ndata: duplicate\n\n',
        'id: 2\ndata: second\n\n',
      ]) as unknown as typeof fetch;

      createSSEClient({
        url: '/api/stream',
        signal: new AbortController().signal,
        retry: { maxRetries: 0 },
        deduplicate: true,
        onMessage(event) {
          events.push(event);
        },
        onClose,
      });

      await vi.waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      }, { timeout: 2000 });

      // Should have skipped the duplicate
      expect(events).toHaveLength(2);
      expect(events[0]!.data).toBe('first');
      expect(events[1]!.data).toBe('second');
    });
  });

  // =========================================================================
  // Client Instance
  // =========================================================================
  describe('client instance', () => {
    it('should expose close method', async () => {
      const onClose = vi.fn();
      const onOpen = vi.fn();

      globalThis.fetch = mockFetchSuccess([
        'data: test\n\n',
      ]) as unknown as typeof fetch;

      const client = createSSEClient({
        url: '/api/stream',
        retry: { maxRetries: 0 },
        onOpen,
        onMessage() {},
        onClose,
      });

      expect(typeof client.close).toBe('function');

      // Wait for connection to establish
      await vi.waitFor(() => {
        expect(onOpen).toHaveBeenCalled();
      }, { timeout: 2000 });

      client.close();

      // Give time for close to propagate
      await vi.waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      }, { timeout: 2000 });

      expect(client.state).toBe('closed');
    });
  });
});
