// ============================================================================
// AI-Stream-Kit — Stream Markdown Renderer
// ============================================================================
// Combines auto-close algorithm with an optional Markdown engine to
// produce safe, renderable HTML from a partial Markdown stream.
// ============================================================================

import type { StreamRendererOptions } from '../core/types.js';
import { autoClose } from './auto-close.js';

/**
 * Streaming Markdown renderer that handles partial/unclosed Markdown.
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
 *   // Container is auto-updated with rendered HTML
 * };
 * ```
 */
export class StreamMarkdownRenderer {
  /** Accumulated raw Markdown text */
  private accumulated: string = '';

  /** Configuration */
  private readonly options: StreamRendererOptions;

  /** Cached last output to avoid redundant renders */
  private lastOutput: string = '';

  constructor(options: StreamRendererOptions = {}) {
    this.options = options;
  }

  /**
   * Append a text chunk from the stream.
   *
   * @param chunk - The new text fragment to add
   * @returns The current rendered output (HTML if converter provided, patched Markdown otherwise)
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
   * Get the current rendered output without appending new text.
   */
  getHTML(): string {
    return this.render();
  }

  /**
   * Get the raw accumulated Markdown (before auto-close).
   */
  getRawMarkdown(): string {
    return this.accumulated;
  }

  /**
   * Get the patched Markdown (after auto-close).
   */
  getPatchedMarkdown(): string {
    return autoClose(this.accumulated);
  }

  /**
   * Replace the entire accumulated content.
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
   * Reset all state.
   */
  reset(): void {
    this.accumulated = '';
    this.lastOutput = '';

    if (this.options.container) {
      this.options.container.innerHTML = '';
    }
  }

  /**
   * Get the current text length (useful for progress tracking).
   */
  get length(): number {
    return this.accumulated.length;
  }

  /**
   * Internal render pipeline:
   * 1. Auto-close unclosed tags
   * 2. Convert to HTML if converter is provided
   */
  private render(): string {
    const patched = autoClose(this.accumulated);

    if (this.options.markdownToHtml) {
      return this.options.markdownToHtml(patched);
    }

    return patched;
  }

  /**
   * Scroll the container to the bottom.
   */
  private scrollToBottom(): void {
    const container = this.options.container;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }
}
