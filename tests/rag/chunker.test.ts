// ============================================================================
// Tests: Text Chunker
// ============================================================================

import { describe, it, expect } from 'vitest';
import { chunkText } from '../../src/rag/chunker.js';

describe('chunkText', () => {
  // =========================================================================
  // Basic Chunking
  // =========================================================================
  describe('basic chunking', () => {
    it('should return empty array for empty text', () => {
      expect(chunkText('')).toEqual([]);
    });

    it('should return empty array for whitespace-only text', () => {
      expect(chunkText('   ')).toEqual([]);
    });

    it('should return single chunk for short text', () => {
      const result = chunkText('Hello world', { chunkSize: 500 });
      expect(result).toEqual(['Hello world']);
    });

    it('should return single chunk when text equals chunkSize', () => {
      const text = 'a'.repeat(500);
      const result = chunkText(text, { chunkSize: 500 });
      expect(result).toEqual([text]);
    });
  });

  // =========================================================================
  // Paragraph Splitting
  // =========================================================================
  describe('paragraph splitting', () => {
    it('should split on double newlines', () => {
      const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
      const result = chunkText(text, { chunkSize: 30, overlap: 0 });
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0]).toContain('Paragraph one');
    });
  });

  // =========================================================================
  // Sentence Splitting
  // =========================================================================
  describe('sentence splitting', () => {
    it('should split on sentence boundaries when paragraphs are too long', () => {
      const text = 'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.';
      const result = chunkText(text, { chunkSize: 40, overlap: 0 });
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // Overlap
  // =========================================================================
  describe('overlap', () => {
    it('should create overlapping chunks', () => {
      const text = 'AAAA.\n\nBBBB.\n\nCCCC.\n\nDDDD.';
      const result = chunkText(text, { chunkSize: 15, overlap: 5 });

      // With overlap, we should see some content repeated between chunks
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle zero overlap', () => {
      const text = 'Short.\n\nAnother short.\n\nOne more.';
      const result = chunkText(text, { chunkSize: 18, overlap: 0 });
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // Character-Level Fallback
  // =========================================================================
  describe('character-level fallback', () => {
    it('should fall back to character splitting for long lines without separators', () => {
      const text = 'a'.repeat(1000);
      const result = chunkText(text, { chunkSize: 100, overlap: 10 });
      
      expect(result.length).toBeGreaterThanOrEqual(9);
      for (const chunk of result) {
        expect(chunk.length).toBeLessThanOrEqual(100);
      }
    });
  });

  // =========================================================================
  // Chinese Text
  // =========================================================================
  describe('Chinese text', () => {
    it('should handle Chinese text correctly', () => {
      const text = '这是第一段话。这是第二句话。\n\n这是第二段话。这是第二段的第二句。\n\n这是第三段话。';
      const result = chunkText(text, { chunkSize: 30, overlap: 5 });
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('should split on Chinese period', () => {
      const text = '第一句话。第二句话。第三句话。第四句话。第五句话。第六句话。第七句话。第八句话。';
      const result = chunkText(text, { chunkSize: 20, overlap: 0 });
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // Custom Separators
  // =========================================================================
  describe('custom separators', () => {
    it('should use custom separator list', () => {
      const text = 'A|B|C|D|E|F|G|H';
      const result = chunkText(text, {
        chunkSize: 5,
        overlap: 0,
        separators: ['|'],
      });
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================
  describe('edge cases', () => {
    it('should handle text with only separators', () => {
      const result = chunkText('\n\n\n\n', { chunkSize: 10 });
      expect(result).toEqual([]);
    });

    it('should trim chunks', () => {
      const text = '  hello  \n\n  world  ';
      const result = chunkText(text, { chunkSize: 100 });
      expect(result[0]).not.toMatch(/^\s/);
      expect(result[0]).not.toMatch(/\s$/);
    });
  });
});
