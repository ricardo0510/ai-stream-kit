// ============================================================================
// AI-Stream-Kit — Debounce Render Scheduler
// ============================================================================
// Prevents UI jank by coalescing rapid DOM updates into a single
// requestAnimationFrame callback per frame (~16.67ms at 60fps).
//
// When AI outputs tokens every few milliseconds, we batch all pending
// updates and apply them once per animation frame.
// ============================================================================

/**
 * Render callback type.
 */
export type RenderCallback = (content: string) => void;

/**
 * Frame-based render scheduler that coalesces rapid updates.
 *
 * @example
 * ```ts
 * const scheduler = new RenderScheduler();
 *
 * // These three calls within the same frame will result in
 * // only one DOM update with the latest content:
 * scheduler.schedule('<p>He</p>', updateDOM);
 * scheduler.schedule('<p>Hell</p>', updateDOM);
 * scheduler.schedule('<p>Hello</p>', updateDOM);
 * // => updateDOM('<p>Hello</p>') called once on next frame
 * ```
 */
export class RenderScheduler {
  /** The latest content waiting to be rendered */
  private pending: string | null = null;

  /** The requestAnimationFrame ID, if a frame is scheduled */
  private rafId: number | null = null;

  /** The callback to be invoked with pending content */
  private pendingCallback: RenderCallback | null = null;

  /** Whether the scheduler has been disposed */
  private disposed: boolean = false;

  /**
   * Schedule a render with the given content.
   * Multiple calls within the same frame are coalesced (last write wins).
   *
   * @param content - The content to render
   * @param callback - The function to call with content on the next frame
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
   * Force an immediate render of any pending content.
   * Useful for final render when stream completes.
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
   * Check if there is a pending render.
   */
  get hasPending(): boolean {
    return this.pending !== null;
  }

  /**
   * Dispose the scheduler and cancel any pending frame.
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
 * Create a fallback render scheduler for Node.js environments
 * (uses setTimeout instead of requestAnimationFrame).
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
