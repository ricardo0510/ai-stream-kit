// ============================================================================
// Tests: Auto-Close Algorithm
// ============================================================================

import { describe, it, expect } from 'vitest';
import { autoClose } from '../../src/renderer/auto-close.js';

describe('autoClose', () => {
  // =========================================================================
  // No Changes Needed
  // =========================================================================
  describe('complete content (no changes needed)', () => {
    it('should return plain text unchanged', () => {
      expect(autoClose('hello world')).toBe('hello world');
    });

    it('should return empty string unchanged', () => {
      expect(autoClose('')).toBe('');
    });

    it('should return complete bold unchanged', () => {
      expect(autoClose('**complete**')).toBe('**complete**');
    });

    it('should return complete italic unchanged', () => {
      expect(autoClose('*italic*')).toBe('*italic*');
    });

    it('should return complete strikethrough unchanged', () => {
      expect(autoClose('~~struck~~')).toBe('~~struck~~');
    });

    it('should return complete code block unchanged', () => {
      expect(autoClose('```js\ncode\n```')).toBe('```js\ncode\n```');
    });

    it('should return complete inline code unchanged', () => {
      expect(autoClose('`inline`')).toBe('`inline`');
    });

    it('should return complete link unchanged', () => {
      expect(autoClose('[text](url)')).toBe('[text](url)');
    });
  });

  // =========================================================================
  // Bold / Strong
  // =========================================================================
  describe('bold (**)', () => {
    it('should close unclosed bold', () => {
      expect(autoClose('**hello')).toBe('**hello**');
    });

    it('should close bold with content', () => {
      expect(autoClose('text **bold text')).toBe('text **bold text**');
    });

    it('should handle already partially closed bold', () => {
      expect(autoClose('**a** **b')).toBe('**a** **b**');
    });
  });

  // =========================================================================
  // Italic
  // =========================================================================
  describe('italic (*)', () => {
    it('should close unclosed italic', () => {
      expect(autoClose('*italic text')).toBe('*italic text*');
    });

    it('should handle italic within text', () => {
      expect(autoClose('before *italic')).toBe('before *italic*');
    });
  });

  // =========================================================================
  // Underscore variants
  // =========================================================================
  describe('underscore variants', () => {
    it('should close unclosed __ bold', () => {
      expect(autoClose('__bold')).toBe('__bold__');
    });

    it('should close unclosed _ italic', () => {
      expect(autoClose('_italic')).toBe('_italic_');
    });
  });

  // =========================================================================
  // Strikethrough
  // =========================================================================
  describe('strikethrough (~~)', () => {
    it('should close unclosed strikethrough', () => {
      expect(autoClose('~~strike')).toBe('~~strike~~');
    });
  });

  // =========================================================================
  // Inline Code
  // =========================================================================
  describe('inline code (`)', () => {
    it('should close unclosed inline code', () => {
      expect(autoClose('`code')).toBe('`code`');
    });

    it('should not process markers inside inline code', () => {
      // Inside unclosed inline code, ** should not be interpreted
      const result = autoClose('`**not bold');
      expect(result).toBe('`**not bold`');
    });
  });

  // =========================================================================
  // Code Blocks
  // =========================================================================
  describe('code blocks (```)', () => {
    it('should close unclosed code block', () => {
      expect(autoClose('```\ncode')).toBe('```\ncode\n```');
    });

    it('should close code block with language', () => {
      expect(autoClose('```javascript\nconst a = 1')).toBe(
        '```javascript\nconst a = 1\n```'
      );
    });

    it('should close code block with json', () => {
      expect(autoClose('```json\n{"key":')).toBe('```json\n{"key":\n```');
    });

    it('should close code block with python', () => {
      expect(autoClose('```python\ndef foo():')).toBe(
        '```python\ndef foo():\n```'
      );
    });

    it('should not process inline markers inside code block', () => {
      const result = autoClose('```\n**not bold\n*not italic');
      expect(result).toBe('```\n**not bold\n*not italic\n```');
    });

    it('should handle code block followed by text', () => {
      const result = autoClose('```js\ncode\n```\n**bold');
      expect(result).toBe('```js\ncode\n```\n**bold**');
    });

    it('should handle tilde code fences', () => {
      expect(autoClose('~~~\ncode')).toBe('~~~\ncode\n~~~');
    });

    it('should handle extended fences (````)', () => {
      expect(autoClose('````\ncode')).toBe('````\ncode\n````');
    });
  });

  // =========================================================================
  // Links
  // =========================================================================
  describe('links', () => {
    it('should close unclosed link text', () => {
      expect(autoClose('[link text')).toBe('[link text]()');
    });

    it('should close unclosed link URL', () => {
      expect(autoClose('[link](http://exam')).toBe('[link](http://exam)');
    });

    it('should handle complete link followed by unclosed bold', () => {
      expect(autoClose('[link](url) **bold')).toBe('[link](url) **bold**');
    });
  });

  // =========================================================================
  // Images
  // =========================================================================
  describe('images', () => {
    it('should close unclosed image alt text', () => {
      expect(autoClose('![alt text')).toBe('![alt text]()');
    });

    it('should close unclosed image URL', () => {
      expect(autoClose('![alt](http://img')).toBe('![alt](http://img)');
    });
  });

  // =========================================================================
  // Nested / Complex Cases
  // =========================================================================
  describe('nested and complex cases', () => {
    it('should handle bold + italic nested', () => {
      const result = autoClose('**bold *and italic');
      expect(result).toBe('**bold *and italic***');
    });

    it('should handle escaped markers', () => {
      // \* should not be treated as italic
      expect(autoClose('\\*not italic')).toBe('\\*not italic');
    });

    it('should handle multiple unclosed markers', () => {
      const result = autoClose('**bold ~~strike');
      expect(result).toBe('**bold ~~strike~~**');
    });

    it('should handle real-world AI streaming scenario', () => {
      const partial = '## 回答\n\n这是一个**重要的概念';
      const result = autoClose(partial);
      expect(result).toBe('## 回答\n\n这是一个**重要的概念**');
    });

    it('should handle code block with surrounding markup', () => {
      const partial = '以下是代码：\n\n```typescript\nconst x = 1';
      const result = autoClose(partial);
      expect(result).toBe(
        '以下是代码：\n\n```typescript\nconst x = 1\n```'
      );
    });
  });

  // =========================================================================
  // Performance Edge Cases
  // =========================================================================
  describe('performance', () => {
    it('should handle long text efficiently', () => {
      const longText = 'a'.repeat(10000) + '**unclosed';
      const start = performance.now();
      const result = autoClose(longText);
      const elapsed = performance.now() - start;

      expect(result.endsWith('**')).toBe(true);
      expect(elapsed).toBeLessThan(100); // Should be very fast
    });

    it('should handle many lines efficiently', () => {
      const manyLines = Array.from({ length: 1000 }, (_, i) => `Line ${i}`).join('\n');
      const input = manyLines + '\n**bold';
      const start = performance.now();
      const result = autoClose(input);
      const elapsed = performance.now() - start;

      expect(result.endsWith('**')).toBe(true);
      expect(elapsed).toBeLessThan(200);
    });
  });
});
