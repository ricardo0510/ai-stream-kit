// ============================================================================
// Tests: Cosine Similarity & Vector Math
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  euclideanDistance,
  dotProduct,
  normalize,
} from '../../src/rag/similarity.js';

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0, 10);
  });

  it('should return 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0, 10);
  });

  it('should return -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1.0, 10);
  });

  it('should handle float vectors', () => {
    const a = [0.1, 0.2, 0.3];
    const b = [0.3, 0.2, 0.1];
    const result = cosineSimilarity(a, b);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });

  it('should return 0 for zero vector', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('should throw for dimension mismatch', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(
      'Vector dimension mismatch'
    );
  });

  it('should throw for empty vectors', () => {
    expect(() => cosineSimilarity([], [])).toThrow(
      'Cannot compute similarity of zero-length vectors'
    );
  });

  it('should be symmetric', () => {
    const a = [1, 3, 5, 7];
    const b = [2, 4, 6, 8];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });

  it('should handle high-dimensional vectors', () => {
    const dim = 384; // MiniLM embedding dimension
    const a = Array.from({ length: dim }, (_, i) => Math.sin(i));
    const b = Array.from({ length: dim }, (_, i) => Math.cos(i));
    const result = cosineSimilarity(a, b);
    expect(typeof result).toBe('number');
    expect(Number.isNaN(result)).toBe(false);
  });

  it('should handle normalized vectors correctly', () => {
    const a = normalize([1, 2, 3]);
    const b = normalize([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 10);
  });
});

describe('euclideanDistance', () => {
  it('should return 0 for identical vectors', () => {
    expect(euclideanDistance([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it('should compute correct distance', () => {
    expect(euclideanDistance([0, 0], [3, 4])).toBeCloseTo(5.0);
  });

  it('should throw for dimension mismatch', () => {
    expect(() => euclideanDistance([1], [1, 2])).toThrow(
      'Vector dimension mismatch'
    );
  });
});

describe('dotProduct', () => {
  it('should compute correct dot product', () => {
    expect(dotProduct([1, 2, 3], [4, 5, 6])).toBe(32);
  });

  it('should return 0 for orthogonal vectors', () => {
    expect(dotProduct([1, 0], [0, 1])).toBe(0);
  });

  it('should throw for dimension mismatch', () => {
    expect(() => dotProduct([1], [1, 2])).toThrow('Vector dimension mismatch');
  });
});

describe('normalize', () => {
  it('should produce unit vector', () => {
    const result = normalize([3, 4]);
    const magnitude = Math.sqrt(result[0]! ** 2 + result[1]! ** 2);
    expect(magnitude).toBeCloseTo(1.0, 10);
  });

  it('should preserve direction', () => {
    const v = [2, 0, 0];
    const result = normalize(v);
    expect(result[0]).toBeCloseTo(1.0);
    expect(result[1]).toBeCloseTo(0.0);
    expect(result[2]).toBeCloseTo(0.0);
  });

  it('should handle zero vector', () => {
    const result = normalize([0, 0, 0]);
    expect(result).toEqual([0, 0, 0]);
  });

  it('should already normalized vector unchanged', () => {
    const v = normalize([1, 0, 0]);
    expect(v[0]).toBeCloseTo(1.0);
    expect(v[1]).toBeCloseTo(0.0);
  });
});
