// ============================================================================
// AI-Stream-Kit — 渲染频次合并调度器 (Debounce Render Scheduler)
// ============================================================================
// 如果每收到一次 SSE 打字机流转推播就去刷新一次前台笨重的 DOM 回报，界面将严重卡顿失帧。
//
// 此架构旨在把短时（如一丁点毫秒差距的流送达）爆发式高能 DOM 操作合并吞并为，
// 至多一帧内执行一次的清算任务。在确保视觉流畅(60fps)的底线下，斩断绝大部分多余的性能内耗开销。
// ============================================================================

/**
 * 具体下放交给外层的渲染刷漆工人回调类型。
 */
export type RenderCallback = (content: string) => void;

/**
 * 基于显示器屏幕绘制原生的按帧合并拦截调度控制器。
 *
 * @example
 * ```ts
 * const scheduler = new RenderScheduler();
 *
 * // 在人眼感知的几毫秒之内的疯狂请求，它都会给你兜底合并并抹除前科，只留最后一次执行。
 * scheduler.schedule('<p>你</p>', updateDOM);
 * scheduler.schedule('<p>好</p>', updateDOM);
 * scheduler.schedule('<p>很高兴见到你</p>', updateDOM);
 * // => updateDOM('<p>很高兴见到你</p>') 最后仅会在下一次显示器重绘帧点上启动
 * ```
 */
export class RenderScheduler {
  /** 暂押在内部等待接受判决下发的更新文本 */
  private pending: string | null = null;

  /** 被打上标记挂在一旁的屏幕绘制 requestAnimationFrame 追踪号 */
  private rafId: number | null = null;

  /** 被外带传入并延后候命的回调函式体 */
  private pendingCallback: RenderCallback | null = null;

  /** 防御项：标志着调度器是否遭遇外部手动强行解体释放 */
  private disposed: boolean = false;

  /**
   * 将新收到的内容放入池子等待被安排调度展出。
   * 它采用覆盖机制，以最后放进来的为准。
   *
   * @param content - 等待涂抹的内容
   * @param callback - 挂靠的回调委托
   */
  schedule(content: string, callback: RenderCallback): void {
    if (this.disposed) return;

    this.pending = content;
    this.pendingCallback = callback;

    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.flush();
      });
    }
  }

  /**
   * 无视帧等候强行释放清仓处理（往往在结束接收时用来保底避免丢下最后一口气）。
   */
  flush(): void {
    if (this.pending !== null && this.pendingCallback !== null) {
      const content = this.pending;
      const callback = this.pendingCallback;
      this.pending = null;
      this.pendingCallback = null;
      this.rafId = null;
      callback(content);
    } else {
      this.rafId = null;
    }
  }

  /**
   * 是否仍有存货被搁置在待发送序列未发送。
   */
  get hasPending(): boolean {
    return this.pending !== null;
  }

  /**
   * 给这位功成名就的调度器办离职，卸载清空相关动画帧钩子，安全地回收内存。
   */
  dispose(): void {
    this.disposed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pending = null;
    this.pendingCallback = null;
  }
}

/**
 * 专供缺乏浏览器 DOM `requestAnimationFrame` 函数定义的 Node.js 宿主服务器使用。
 * 它退而选用降级的 `setTimeout` 方案充当替补时间表驱动。
 */
export class NodeRenderScheduler {
  private pending: string | null = null;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private pendingCallback: RenderCallback | null = null;
  private disposed: boolean = false;

  schedule(content: string, callback: RenderCallback): void {
    if (this.disposed) return;

    this.pending = content;
    this.pendingCallback = callback;

    if (this.timerId === null) {
      this.timerId = setTimeout(() => {
        this.flush();
      }, 16); // ~60fps
    }
  }

  flush(): void {
    if (this.pending !== null && this.pendingCallback !== null) {
      const content = this.pending;
      const callback = this.pendingCallback;
      this.pending = null;
      this.pendingCallback = null;
      this.timerId = null;
      callback(content);
    } else {
      this.timerId = null;
    }
  }

  get hasPending(): boolean {
    return this.pending !== null;
  }

  dispose(): void {
    this.disposed = true;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.pending = null;
    this.pendingCallback = null;
  }
}
