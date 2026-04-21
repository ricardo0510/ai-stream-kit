// ============================================================================
// AI-Stream-Kit — High-Reliability SSE Client
// ============================================================================
// Features:
// - Native fetch + ReadableStream (no Axios dependency)
// - Automatic reconnection with exponential backoff
// - Last-Event-ID based resumption (断点续传)
// - AbortController integration for user-initiated cancellation
// - Event deduplication based on event ID
// ============================================================================

import type {
  SSEClientOptions,
  SSEClientInstance,
  SSEConnectionState,
  RetryOptions,
} from './types.js';
import { SSEClientError } from './types.js';
import { SSEParser } from './sse-parser.js';
import {
  resolveRetryOptions,
  shouldRetry,
  waitForRetry,
} from './retry-strategy.js';

/**
 * Create a new SSE client instance.
 *
 * @example
 * ```ts
 * const controller = new AbortController();
 *
 * const client = createSSEClient({
 *   url: '/api/chat/stream',
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ prompt: '你好' }),
 *   signal: controller.signal,
 *   retry: { maxRetries: 5, baseDelay: 1000, jitter: true },
 *   onMessage(event) {
 *     const data = JSON.parse(event.data);
 *     console.log(data.text);
 *   },
 *   onError(error) {
 *     console.error('SSE error:', error.message);
 *   },
 * });
 *
 * // User clicks "Stop Generating"
 * stopButton.onclick = () => controller.abort();
 * ```
 */
export function createSSEClient(options: SSEClientOptions): SSEClientInstance {
  const retryOptions: RetryOptions = resolveRetryOptions(options.retry);
  const deduplicate = options.deduplicate ?? true;

  let state: SSEConnectionState = 'idle';
  let lastEventId: string | undefined = options.lastEventId;
  let attempt = 0;
  let internalAbortController: AbortController | null = null;
  let closed = false;

  // Deduplication set: tracks recently seen event IDs
  const seenIds = new Set<string>();

  // Start the connection
  connect();

  function setState(newState: SSEConnectionState): void {
    state = newState;
  }

  /**
   * Build request headers, including Last-Event-ID for resumption.
   */
  function buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...options.headers,
    };

    if (lastEventId) {
      headers['Last-Event-ID'] = lastEventId;
    }

    return headers;
  }

  /**
   * Initiate a fetch connection and begin reading the stream.
   */
  async function connect(): Promise<void> {
    if (closed) return;

    setState(attempt === 0 ? 'connecting' : 'reconnecting');

    // Create an internal AbortController for this connection attempt
    internalAbortController = new AbortController();

    // If the user's external signal is already aborted, propagate immediately
    if (options.signal?.aborted) {
      handleClose();
      return;
    }

    // Link external abort signal to internal controller
    const onExternalAbort = () => {
      internalAbortController?.abort();
    };
    options.signal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const body =
        options.body && typeof options.body === 'object'
          ? JSON.stringify(options.body)
          : options.body;

      const response = await fetch(options.url, {
        method: options.method ?? 'GET',
        headers: buildHeaders(),
        body: body,
        signal: internalAbortController.signal,
      });

      if (!response.ok) {
        throw new SSEClientError(
          `HTTP ${response.status}: ${response.statusText}`,
          {
            statusCode: response.status,
            retryable: response.status >= 500 || response.status === 429,
          }
        );
      }

      if (!response.body) {
        throw new SSEClientError('Response body is null', { retryable: false });
      }

      // Connection established
      setState('connected');
      attempt = 0; // Reset retry counter on successful connection
      options.onOpen?.();

      // Read the stream
      await readStream(response.body);

      // Stream ended naturally (server closed)
      options.signal?.removeEventListener('abort', onExternalAbort);
      handleStreamEnd();
    } catch (error: unknown) {
      options.signal?.removeEventListener('abort', onExternalAbort);

      if (isAbortError(error)) {
        // User-initiated abort — clean shutdown
        handleClose();
        return;
      }

      const sseError =
        error instanceof SSEClientError
          ? error
          : new SSEClientError(
              error instanceof Error ? error.message : 'Unknown error',
              {
                retryable: true,
                cause: error instanceof Error ? error : undefined,
              }
            );

      options.onError?.(sseError);

      if (sseError.retryable) {
        handleRetry();
      } else {
        handleClose();
      }
    }
  }

  /**
   * Read from the ReadableStream using a reader and TextDecoder,
   * feeding chunks to the SSE parser.
   */
  async function readStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    const parser = new SSEParser((event) => {
      // Update last event ID for reconnection
      if (event.id !== undefined) {
        lastEventId = event.id;
      }

      // Deduplication check
      if (deduplicate && event.id) {
        if (seenIds.has(event.id)) {
          return; // Skip duplicate
        }
        seenIds.add(event.id);
        // Keep dedup set bounded
        if (seenIds.size > 1000) {
          const iterator = seenIds.values();
          const oldest = iterator.next().value;
          if (oldest !== undefined) {
            seenIds.delete(oldest);
          }
        }
      }

      // Handle server-suggested retry interval
      if (event.retry !== undefined) {
        retryOptions.baseDelay = event.retry;
      }

      options.onMessage?.(event);
    });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        parser.feed(text);
      }

      // Flush any remaining decoder state
      const remaining = decoder.decode();
      if (remaining) {
        parser.feed(remaining);
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Handle the end of the stream (server closed the connection).
   * Attempt reconnection if retries are available.
   */
  function handleStreamEnd(): void {
    if (closed) return;
    handleRetry();
  }

  /**
   * Attempt to reconnect with exponential backoff.
   */
  async function handleRetry(): Promise<void> {
    if (closed) return;

    if (!shouldRetry(attempt, retryOptions)) {
      handleClose();
      return;
    }

    setState('reconnecting');

    try {
      await waitForRetry(attempt, retryOptions, options.signal);
      attempt++;
      connect();
    } catch {
      // Aborted during wait — clean shutdown
      handleClose();
    }
  }

  /**
   * Permanently close the connection.
   */
  function handleClose(): void {
    if (closed) return;
    closed = true;
    setState('closed');
    internalAbortController?.abort();
    seenIds.clear();
    options.onClose?.();
  }

  // Return the client instance
  return {
    close(): void {
      handleClose();
    },

    get state(): SSEConnectionState {
      return state;
    },

    get lastEventId(): string | undefined {
      return lastEventId;
    },
  };
}

/**
 * Check if an error is an AbortError.
 */
function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }
  return false;
}
