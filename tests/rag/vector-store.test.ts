// ============================================================================
// Tests: Vector Store
// ============================================================================

import { describe, it, expect } from 'vitest';
import { VectorStore } from '../../src/rag/vector-store.js';

function makeEntry(id: string, embedding: number[], text?: string) {
  return {
    id,
    text: text ?? `text for ${id}`,
    embedding,
  };
}

describe('VectorStore', () => {
  // =========================================================================
  // Basic Operations
  // =========================================================================
  describe('basic operations', () => {
    it('should start empty', () => {
      const store = new VectorStore();
      expect(store.size).toBe(0);
    });

    it('should add entries', () => {
      const store = new VectorStore();
      store.add(makeEntry('1', [1, 0, 0]));
      expect(store.size).toBe(1);
    });

    it('should get entry by id', () => {
      const store = new VectorStore();
      store.add(makeEntry('1', [1, 0, 0], 'hello'));
      const entry = store.get('1');
      expect(entry?.text).toBe('hello');
    });

    it('should return undefined for non-existent id', () => {
      const store = new VectorStore();
      expect(store.get('nonexistent')).toBeUndefined();
    });

    it('should replace entry with same id', () => {
      const store = new VectorStore();
      store.add(makeEntry('1', [1, 0, 0], 'first'));
      store.add(makeEntry('1', [0, 1, 0], 'second'));
      expect(store.size).toBe(1);
      expect(store.get('1')?.text).toBe('second');
    });

    it('should add batch entries', () => {
      const store = new VectorStore();
      store.addBatch([
        makeEntry('1', [1, 0, 0]),
        makeEntry('2', [0, 1, 0]),
        makeEntry('3', [0, 0, 1]),
      ]);
      expect(store.size).toBe(3);
    });

    it('should remove entry', () => {
      const store = new VectorStore();
      store.add(makeEntry('1', [1, 0, 0]));
      expect(store.remove('1')).toBe(true);
      expect(store.size).toBe(0);
    });

    it('should return false when removing non-existent entry', () => {
      const store = new VectorStore();
      expect(store.remove('nonexistent')).toBe(false);
    });

    it('should clear all entries', () => {
      const store = new VectorStore();
      store.addBatch([
        makeEntry('1', [1, 0, 0]),
        makeEntry('2', [0, 1, 0]),
      ]);
      store.clear();
      expect(store.size).toBe(0);
    });
  });

  // =========================================================================
  // Search
  // =========================================================================
  describe('search', () => {
    it('should return empty for empty store', () => {
      const store = new VectorStore();
      const results = store.search([1, 0, 0], 3);
      expect(results).toEqual([]);
    });

    it('should find most similar entry', () => {
      const store = new VectorStore();
      store.addBatch([
        makeEntry('similar', [0.9, 0.1, 0.0], 'most similar'),
        makeEntry('different', [0.0, 0.0, 1.0], 'least similar'),
        makeEntry('medium', [0.5, 0.5, 0.0], 'medium similar'),
      ]);

      const results = store.search([1, 0, 0], 1);
      expect(results).toHaveLength(1);
      expect(results[0]!.entry.id).toBe('similar');
    });

    it('should return results sorted by similarity', () => {
      const store = new VectorStore();
      store.addBatch([
        makeEntry('a', [1, 0, 0]),
        makeEntry('b', [0.7, 0.7, 0]),
        makeEntry('c', [0, 0, 1]),
      ]);

      const results = store.search([1, 0, 0], 3);
      expect(results).toHaveLength(3);
      // First result should be most similar
      expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
      expect(results[1]!.score).toBeGreaterThan(results[2]!.score);
    });

    it('should respect topK limit', () => {
      const store = new VectorStore();
      for (let i = 0; i < 10; i++) {
        const emb = new Array(3).fill(0) as number[];
        emb[i % 3] = 1;
        store.add(makeEntry(`${i}`, emb));
      }

      const results = store.search([1, 0, 0], 3);
      expect(results).toHaveLength(3);
    });

    it('should return all if topK > store size', () => {
      const store = new VectorStore();
      store.add(makeEntry('1', [1, 0, 0]));
      store.add(makeEntry('2', [0, 1, 0]));

      const results = store.search([1, 0, 0], 10);
      expect(results).toHaveLength(2);
    });

    it('should include score in results', () => {
      const store = new VectorStore();
      store.add(makeEntry('exact', [1, 0, 0]));

      const results = store.search([1, 0, 0], 1);
      expect(results[0]!.score).toBeCloseTo(1.0, 5);
    });
  });

  // =========================================================================
  // Serialization
  // =========================================================================
  describe('serialization', () => {
    it('should serialize to JSON', () => {
      const store = new VectorStore();
      store.add(makeEntry('1', [1, 2, 3], 'test'));

      const json = store.toJSON();
      expect(json.entries).toHaveLength(1);
      expect(json.entries[0]!.id).toBe('1');
    });

    it('should deserialize from JSON', () => {
      const data = {
        entries: [makeEntry('1', [1, 0, 0], 'hello')],
      };

      const store = VectorStore.fromJSON(data);
      expect(store.size).toBe(1);
      expect(store.get('1')?.text).toBe('hello');
    });

    it('should round-trip through JSON', () => {
      const store = new VectorStore();
      store.addBatch([
        makeEntry('1', [1, 0, 0]),
        makeEntry('2', [0, 1, 0]),
      ]);

      const json = JSON.parse(JSON.stringify(store.toJSON()));
      const restored = VectorStore.fromJSON(json);

      expect(restored.size).toBe(2);
      expect(restored.get('1')?.embedding).toEqual([1, 0, 0]);
    });

    it('should getAll entries', () => {
      const store = new VectorStore();
      store.addBatch([
        makeEntry('1', [1, 0, 0]),
        makeEntry('2', [0, 1, 0]),
      ]);

      const all = store.getAll();
      expect(all).toHaveLength(2);

      // Should be a copy
      all.pop();
      expect(store.size).toBe(2);
    });
  });
});
