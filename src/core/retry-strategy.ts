// ============================================================================
// AI-Stream-Kit — 指数退避重试策略 (Exponential Backoff Retry Strategy)
// ============================================================================
// 该模块主要负责在重新连接期间使用指数退避以及可选的随机偏移量 (jitter)，
// 此举能有效预防断流产生的大规模断线从而引发的“惊群效应” (Thundering Herd)。
//
// 计算公式: 延迟 = min(基础延迟 × 2^尝试次数 + 随机抖动, 最大允许延迟)
// ============================================================================

import type { RetryOptions } from './types.js';

/**
 * 默认使用的预置断线重发配置方案。
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 5,
  baseDelay: 1000,
  maxDelay: 30_000,
  jitter: true,
};

/**
 * 合并合并用户传递进来的各项重发参数配置到默认预设中。
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
 * 结算下一次重新连接行为前需要静默等待的时间延迟(ms)。
 *
 * 底层默认使用标准的指数量级退避算法: baseDelay × 2^attempt
 * 当开启 Jitter 时，会增加一段从 [0, baseDelay) 的随机等待时间段以错开连接波峰。
 *
 * @param attempt - 以 0 开始计数的重试次数（0 代表发生第一次意外后的重试）
 * @param options - 退避设置项
 * @returns 最终静悄悄摸鱼耗时的毫秒数
 *
 * @example
 * ```ts
 * // 关闭随机抖动时 (确定的绝对排队机制):
 * calculateDelay(0, { baseDelay: 1000, maxDelay: 30000, jitter: false })
 * // => 1000ms
 *
 * calculateDelay(1, ...) // => 2000ms
 * calculateDelay(2, ...) // => 4000ms
 * calculateDelay(3, ...) // => 8000ms
 * calculateDelay(10, ...) // => 30000ms (将触碰并且不超出最大上限)
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
 * 判定当下的尝试情形之下，是否还存在被允许再次重连接的资格。
 *
 * @param attempt - 以 0 开始计算的当前阶段发起了几回冲锋
 * @param options - 重连的策略配置组合
 * @returns 是否依然保有复工权限
 */
export function shouldRetry(
  attempt: number,
  options: RetryOptions
): boolean {
  return attempt < options.maxRetries;
}

/**
 * 暴露对外的异步倒数定时拦截器。会占用程序一段时间。
 * 此中内嵌响应逻辑确保可以通过 `AbortSignal` 主发中断。
 *
 * @param attempt - 当前计次的尝试量 (0起算)
 * @param options - 延迟时长计算所需的属性支持
 * @param signal - 可以可选地传入用以提早中断等待倒计时器的外界信号
 * @returns 虚无のPromise句柄
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
