// ============================================================================
// AI-Stream-Kit — Exponential Backoff Retry Strategy
// ============================================================================
// Implements exponential backoff with optional jitter to prevent
// thundering herd effects during reconnection storms.
//
// Formula: delay = min(baseDelay × 2^attempt + jitter, maxDelay)
// ============================================================================

import type { RetryOptions } from './types.js';

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 5,
  baseDelay: 1000,
  maxDelay: 30_000,
  jitter: true,
};

/**
 * Merge user-provided partial options with defaults.
 */
export function resolveRetryOptions(
  partial?: Partial<RetryOptions>
): RetryOptions {
  return {
    ...DEFAULT_RETRY_OPTIONS,
    ...partial,
  };
}

/**
 * Calculate the delay before the next retry attempt.
 *
 * Uses exponential backoff: baseDelay × 2^attempt
 * With optional random jitter in the range [0, baseDelay) to spread out
 * reconnection attempts across multiple clients.
 *
 * @param attempt - Zero-based attempt number (0 = first retry)
 * @param options - Retry configuration
 * @returns Delay in milliseconds
 *
 * @example
 * ```ts
 * // Without jitter (deterministic):
 * calculateDelay(0, { baseDelay: 1000, maxDelay: 30000, jitter: false })
 * // => 1000ms
 *
 * calculateDelay(1, ...) // => 2000ms
 * calculateDelay(2, ...) // => 4000ms
 * calculateDelay(3, ...) // => 8000ms
 * calculateDelay(10, ...) // => 30000ms (capped)
 * ```
 */
export function calculateDelay(
  attempt: number,
  options: RetryOptions
): number {
  const exponential = options.baseDelay * Math.pow(2, attempt);
  const jitter = options.jitter
    ? Math.random() * options.baseDelay
    : 0;
  return Math.min(exponential + jitter, options.maxDelay);
}

/**
 * Determine whether a retry should be attempted.
 *
 * @param attempt - Zero-based current attempt number
 * @param options - Retry configuration
 * @returns Whether retry is allowed
 */
export function shouldRetry(
  attempt: number,
  options: RetryOptions
): boolean {
  return attempt < options.maxRetries;
}

/**
 * Create a promise that resolves after the calculated backoff delay.
 * Can be cancelled via AbortSignal.
 *
 * @param attempt - Zero-based attempt number
 * @param options - Retry configuration
 * @param signal - Optional AbortSignal for cancellation
 * @returns Promise that resolves when the delay has elapsed
 */
export function waitForRetry(
  attempt: number,
  options: RetryOptions,
  signal?: AbortSignal
): Promise<void> {
  const delay = calculateDelay(attempt, options);

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delay);

    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(signal!.reason ?? new DOMException('Aborted', 'AbortError'));
    };

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
