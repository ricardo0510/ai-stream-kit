// ============================================================================
// Tests: Stream Markdown Renderer
// ============================================================================

import { describe, it, expect } from 'vitest';
import { StreamMarkdownRenderer } from '../../src/renderer/markdown-renderer.js';

describe('StreamMarkdownRenderer', () => {
  // =========================================================================
  // Basic Operation
  // =========================================================================
  describe('basic operation', () => {
    it('should accumulate text from append calls', () => {
      const renderer = new StreamMarkdownRenderer();
      renderer.append('Hello ');
      const result = renderer.append('World');
      expect(result).toBe('Hello World');
    });

    it('should return auto-closed markdown by default', () => {
      const renderer = new StreamMarkdownRenderer();
      const result = renderer.append('**bold');
      expect(result).toBe('**bold**');
    });

    it('should use custom markdownToHtml converter', () => {
      const renderer = new StreamMarkdownRenderer({
        markdownToHtml: (md) => `<p>${md}</p>`,
      });
      const result = renderer.append('hello');
      expect(result).toBe('<p>hello</p>');
    });

    it('should pass auto-closed content to converter', () => {
      const renderer = new StreamMarkdownRenderer({
        markdownToHtml: (md) => md,
      });
      const result = renderer.append('**bold');
      expect(result).toBe('**bold**');
    });
  });

  // =========================================================================
  // State Management
  // =========================================================================
  describe('state management', () => {
    it('should return raw markdown', () => {
      const renderer = new StreamMarkdownRenderer();
      renderer.append('**hello');
      expect(renderer.getRawMarkdown()).toBe('**hello');
    });

    it('should return patched markdown', () => {
      const renderer = new StreamMarkdownRenderer();
      renderer.append('**hello');
      expect(renderer.getPatchedMarkdown()).toBe('**hello**');
    });

    it('should track length', () => {
      const renderer = new StreamMarkdownRenderer();
      renderer.append('hello');
      expect(renderer.length).toBe(5);
      renderer.append(' world');
      expect(renderer.length).toBe(11);
    });

    it('should reset all state', () => {
      const renderer = new StreamMarkdownRenderer();
      renderer.append('hello');
      renderer.reset();
      expect(renderer.getRawMarkdown()).toBe('');
      expect(renderer.length).toBe(0);
    });

    it('should replace content with setContent', () => {
      const renderer = new StreamMarkdownRenderer();
      renderer.append('old content');
      renderer.setContent('new content');
      expect(renderer.getRawMarkdown()).toBe('new content');
    });
  });

  // =========================================================================
  // getHTML
  // =========================================================================
  describe('getHTML', () => {
    it('should return current output without appending', () => {
      const renderer = new StreamMarkdownRenderer();
      renderer.append('**text');
      const html = renderer.getHTML();
      expect(html).toBe('**text**');

      // Verify nothing was appended
      expect(renderer.length).toBe(6); // '**text'
    });
  });

  // =========================================================================
  // Streaming Simulation
  // =========================================================================
  describe('streaming simulation', () => {
    it('should simulate character-by-character streaming', () => {
      const renderer = new StreamMarkdownRenderer();
      const fullText = '**Hello** World';
      const outputs: string[] = [];

      for (const char of fullText) {
        outputs.push(renderer.append(char));
      }

      // Final output should be the complete text
      const last = outputs[outputs.length - 1];
      expect(last).toBe('**Hello** World');
    });

    it('should handle streaming code block', () => {
      const renderer = new StreamMarkdownRenderer();

      let result = renderer.append('```');
      expect(result).toContain('```');

      result = renderer.append('js');
      // Should auto-close the code block
      expect(result).toContain('```');

      result = renderer.append('\nconst x = 1');
      expect(result).toContain('const x = 1');

      result = renderer.append('\n```');
      // Now code block is closed properly
      expect(result).toBe('```js\nconst x = 1\n```');
    });
  });
});
