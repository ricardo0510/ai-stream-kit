// ============================================================================
// AI-Stream-Kit — 流式 Markdown 增量渲染器 (Stream Markdown Renderer)
// ============================================================================
// 负责把 auto-close(防缺失算法) 强行修复后的文本，对接送进选配的外部 Markdown 编译引擎。
// 它可以安全又丝滑地吐出经过合法转化的 HTML 语言文本代码。
// ============================================================================

import type { StreamRendererOptions } from '../core/types.js';
import { autoClose } from './auto-close.js';

/**
 * 流式 Markdown 渲染控制器（用于托管解决所有残缺 Markdown 的安全接引与代传）。
 *
 * @example
 * ```ts
 * import { marked } from 'marked';
 *
 * const renderer = new StreamMarkdownRenderer({
 *   markdownToHtml: (md) => marked.parse(md),
 *   container: document.getElementById('output'),
 * });
 *
 * sseClient.onMessage = (event) => {
 *   renderer.append(JSON.parse(event.data).text);
 *   // 挂了 container 参数它自然而然就会把你传进来的字符同步给画面容器了
 * };
 * ```
 */
export class StreamMarkdownRenderer {
  /** 深埋着累加储存的原滋原味 Markdown 底层字符串 */
  private accumulated: string = '';

  /** 渲染器的核心定制属性面板 */
  private readonly options: StreamRendererOptions;

  /** 本地缓存拦截，防止重复触发相同的废弃刷新事件 */
  private lastOutput: string = '';

  constructor(options: StreamRendererOptions = {}) {
    this.options = options;
  }

  /**
   * 将一块全新收到的文本薄片添加到累加库的顶端里去。
   *
   * @param chunk - 这个小残片将会缝进全文中段
   * @returns 吐出目前被渲染成型的内容 (倘若提供了编译函数就是 HTML 代码，没有则只是缝满补丁的 Markdown 字句)
   */
  append(chunk: string): string {
    this.accumulated += chunk;
    const output = this.render();

    // Update DOM container if provided
    if (this.options.container && output !== this.lastOutput) {
      this.options.container.innerHTML = output;

      if (this.options.autoScroll !== false) {
        this.scrollToBottom();
      }
    }

    this.lastOutput = output;
    return output;
  }

  /**
   * 按下暂定键仅仅获取下当前的渲染成果。
   */
  getHTML(): string {
    return this.render();
  }

  /**
   * 获取内部未遭任何修饰及保底闭合补丁打过的粗糙原石 Markdown 内容。
   */
  getRawMarkdown(): string {
    return this.accumulated;
  }

  /**
   * 获取历经闭合补丁修葺过的严实无缝的 Markdown 内容文本素材。
   */
  getPatchedMarkdown(): string {
    return autoClose(this.accumulated);
  }

  /**
   * 执行霸道式直接替换掉所有长途跋涉积累的内容文本，强硬注入你想要的全文。
   */
  setContent(content: string): string {
    this.accumulated = content;
    const output = this.render();

    if (this.options.container && output !== this.lastOutput) {
      this.options.container.innerHTML = output;
    }

    this.lastOutput = output;
    return output;
  }

  /**
   * 粉碎重启全部内部暂存与 DOM 靶向指向区的内部字符信息，回到白纸状态。
   */
  reset(): void {
    this.accumulated = '';
    this.lastOutput = '';

    if (this.options.container) {
      this.options.container.innerHTML = '';
    }
  }

  /**
   * 获取当下的原本文档堆叠字符字数容量。
   */
  get length(): number {
    return this.accumulated.length;
  }

  /**
   * 隐藏流水控制系统流程：
   * 1. 使用 auto-close 将所有漏风的开口挂件填补死
   * 2. 如果存在转化机器，直接输出漂亮的网页 HTML 标记码
   */
  private render(): string {
    const patched = autoClose(this.accumulated);

    if (this.options.markdownToHtml) {
      return this.options.markdownToHtml(patched);
    }

    return patched;
  }

  /**
   * 使用霸道且最暴力简单的算法帮助滚轴一路滚到底端深渊（实现全自动页面尾随的效果）。
   */
  private scrollToBottom(): void {
    const container = this.options.container;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }
}
