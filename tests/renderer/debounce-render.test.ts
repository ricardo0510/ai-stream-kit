// ============================================================================
// Tests: Debounce Render Scheduler
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NodeRenderScheduler } from '../../src/renderer/debounce-render.js';

// We test NodeRenderScheduler since we're in a Node.js test environment
// (no requestAnimationFrame available). The logic is identical to RenderScheduler.

describe('NodeRenderScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should call callback after delay', () => {
    const scheduler = new NodeRenderScheduler();
    const callback = vi.fn();

    scheduler.schedule('hello', callback);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(20);
    expect(callback).toHaveBeenCalledWith('hello');

    scheduler.dispose();
  });

  it('should coalesce multiple calls into one', () => {
    const scheduler = new NodeRenderScheduler();
    const callback = vi.fn();

    scheduler.schedule('first', callback);
    scheduler.schedule('second', callback);
    scheduler.schedule('third', callback);

    vi.advanceTimersByTime(20);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('third'); // Last write wins

    scheduler.dispose();
  });

  it('should report pending state correctly', () => {
    const scheduler = new NodeRenderScheduler();

    expect(scheduler.hasPending).toBe(false);

    scheduler.schedule('test', vi.fn());
    expect(scheduler.hasPending).toBe(true);

    vi.advanceTimersByTime(20);
    expect(scheduler.hasPending).toBe(false);

    scheduler.dispose();
  });

  it('should flush immediately when requested', () => {
    const scheduler = new NodeRenderScheduler();
    const callback = vi.fn();

    scheduler.schedule('content', callback);
    scheduler.flush();

    expect(callback).toHaveBeenCalledWith('content');
    expect(scheduler.hasPending).toBe(false);

    scheduler.dispose();
  });

  it('should not call callback after dispose', () => {
    const scheduler = new NodeRenderScheduler();
    const callback = vi.fn();

    scheduler.schedule('test', callback);
    scheduler.dispose();

    vi.advanceTimersByTime(20);
    expect(callback).not.toHaveBeenCalled();
  });

  it('should allow scheduling after flush', () => {
    const scheduler = new NodeRenderScheduler();
    const callback = vi.fn();

    scheduler.schedule('first', callback);
    vi.advanceTimersByTime(20);

    scheduler.schedule('second', callback);
    vi.advanceTimersByTime(20);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenNthCalledWith(1, 'first');
    expect(callback).toHaveBeenNthCalledWith(2, 'second');

    scheduler.dispose();
  });

  it('should not schedule when disposed', () => {
    const scheduler = new NodeRenderScheduler();
    const callback = vi.fn();

    scheduler.dispose();
    scheduler.schedule('test', callback);

    vi.advanceTimersByTime(20);
    expect(callback).not.toHaveBeenCalled();
  });
});
