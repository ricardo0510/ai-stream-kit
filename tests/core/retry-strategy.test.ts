// ============================================================================
// Tests: Retry Strategy
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import {
  calculateDelay,
  shouldRetry,
  waitForRetry,
  resolveRetryOptions,
  DEFAULT_RETRY_OPTIONS,
} from '../../src/core/retry-strategy.js';
import type { RetryOptions } from '../../src/core/types.js';

describe('RetryStrategy', () => {
  // =========================================================================
  // resolveRetryOptions
  // =========================================================================
  describe('resolveRetryOptions', () => {
    it('should return defaults when no options provided', () => {
      const opts = resolveRetryOptions();
      expect(opts).toEqual(DEFAULT_RETRY_OPTIONS);
    });

    it('should merge partial options with defaults', () => {
      const opts = resolveRetryOptions({ maxRetries: 10 });
      expect(opts.maxRetries).toBe(10);
      expect(opts.baseDelay).toBe(DEFAULT_RETRY_OPTIONS.baseDelay);
      expect(opts.maxDelay).toBe(DEFAULT_RETRY_OPTIONS.maxDelay);
      expect(opts.jitter).toBe(DEFAULT_RETRY_OPTIONS.jitter);
    });

    it('should override all defaults', () => {
      const custom: RetryOptions = {
        maxRetries: 3,
        baseDelay: 500,
        maxDelay: 10000,
        jitter: false,
      };
      const opts = resolveRetryOptions(custom);
      expect(opts).toEqual(custom);
    });
  });

  // =========================================================================
  // calculateDelay
  // =========================================================================
  describe('calculateDelay', () => {
    const noJitterOpts: RetryOptions = {
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 30000,
      jitter: false,
    };

    it('should return baseDelay for first attempt (0)', () => {
      expect(calculateDelay(0, noJitterOpts)).toBe(1000);
    });

    it('should double delay for each subsequent attempt', () => {
      expect(calculateDelay(1, noJitterOpts)).toBe(2000);
      expect(calculateDelay(2, noJitterOpts)).toBe(4000);
      expect(calculateDelay(3, noJitterOpts)).toBe(8000);
      expect(calculateDelay(4, noJitterOpts)).toBe(16000);
    });

    it('should cap delay at maxDelay', () => {
      expect(calculateDelay(10, noJitterOpts)).toBe(30000);
      expect(calculateDelay(20, noJitterOpts)).toBe(30000);
    });

    it('should add jitter when enabled', () => {
      const jitterOpts: RetryOptions = {
        ...noJitterOpts,
        jitter: true,
      };

      // With jitter, delay should be in range [baseDelay, baseDelay * 2^attempt + baseDelay]
      // but capped at maxDelay
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const delay = calculateDelay(0, jitterOpts);
      // 1000 * 2^0 + 0.5 * 1000 = 1500
      expect(delay).toBe(1500);

      vi.restoreAllMocks();
    });

    it('should produce deterministic delay without jitter', () => {
      const d1 = calculateDelay(2, noJitterOpts);
      const d2 = calculateDelay(2, noJitterOpts);
      expect(d1).toBe(d2);
    });

    it('should handle custom baseDelay', () => {
      const opts: RetryOptions = {
        ...noJitterOpts,
        baseDelay: 500,
      };
      expect(calculateDelay(0, opts)).toBe(500);
      expect(calculateDelay(1, opts)).toBe(1000);
      expect(calculateDelay(2, opts)).toBe(2000);
    });
  });

  // =========================================================================
  // shouldRetry
  // =========================================================================
  describe('shouldRetry', () => {
    const opts: RetryOptions = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      jitter: false,
    };

    it('should allow retry when attempts < maxRetries', () => {
      expect(shouldRetry(0, opts)).toBe(true);
      expect(shouldRetry(1, opts)).toBe(true);
      expect(shouldRetry(2, opts)).toBe(true);
    });

    it('should deny retry when attempts >= maxRetries', () => {
      expect(shouldRetry(3, opts)).toBe(false);
      expect(shouldRetry(4, opts)).toBe(false);
    });

    it('should handle maxRetries = 0', () => {
      const noRetry = { ...opts, maxRetries: 0 };
      expect(shouldRetry(0, noRetry)).toBe(false);
    });
  });

  // =========================================================================
  // waitForRetry
  // =========================================================================
  describe('waitForRetry', () => {
    const opts: RetryOptions = {
      maxRetries: 5,
      baseDelay: 100, // Short delay for tests
      maxDelay: 5000,
      jitter: false,
    };

    it('should resolve after delay', async () => {
      const start = Date.now();
      await waitForRetry(0, opts);
      const elapsed = Date.now() - start;

      // Should be approximately 100ms (allow some tolerance)
      expect(elapsed).toBeGreaterThanOrEqual(80);
      expect(elapsed).toBeLessThan(300);
    });

    it('should reject if signal already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        waitForRetry(0, opts, controller.signal)
      ).rejects.toThrow();
    });

    it('should reject if signal aborts during wait', async () => {
      const controller = new AbortController();

      // Abort after 30ms
      setTimeout(() => controller.abort(), 30);

      const start = Date.now();
      await expect(
        waitForRetry(0, { ...opts, baseDelay: 5000 }, controller.signal)
      ).rejects.toThrow();

      const elapsed = Date.now() - start;
      // Should have been cancelled quickly, not waiting for 5000ms
      expect(elapsed).toBeLessThan(500);
    });
  });
});
