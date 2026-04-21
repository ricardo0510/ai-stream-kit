// ============================================================================
// AI-Stream-Kit — In-Memory Vector Store
// ============================================================================
// A lightweight, dependency-free vector store for client-side RAG.
// Supports add, search (Top-K by cosine similarity), and clear operations.
// ============================================================================

import type { VectorEntry, SearchResult } from '../core/types.js';
import { cosineSimilarity } from './similarity.js';

/**
 * In-memory vector store with Top-K similarity search.
 *
 * @example
 * ```ts
 * const store = new VectorStore();
 *
 * store.add({
 *   id: 'chunk-1',
 *   text: 'TypeScript is a typed superset of JavaScript.',
 *   embedding: [0.1, 0.2, 0.3, ...],
 * });
 *
 * const results = store.search(queryEmbedding, 3);
 * // => [{ entry: {...}, score: 0.95 }, ...]
 * ```
 */
export class VectorStore {
  /** Internal storage */
  private entries: VectorEntry[] = [];

  /** Index for fast lookups by ID */
  private idIndex: Map<string, number> = new Map();

  /**
   * Add an entry to the store.
   * If an entry with the same ID already exists, it will be replaced.
   *
   * @param entry - The vector entry to add
   */
  add(entry: VectorEntry): void {
    const existingIndex = this.idIndex.get(entry.id);
    if (existingIndex !== undefined) {
      this.entries[existingIndex] = entry;
    } else {
      this.idIndex.set(entry.id, this.entries.length);
      this.entries.push(entry);
    }
  }

  /**
   * Add multiple entries at once.
   *
   * @param entries - Array of vector entries
   */
  addBatch(entries: VectorEntry[]): void {
    for (const entry of entries) {
      this.add(entry);
    }
  }

  /**
   * Search for the most similar entries to a query vector.
   *
   * @param queryEmbedding - The query vector to compare against
   * @param topK - Number of top results to return (default: 3)
   * @returns Array of search results sorted by similarity (highest first)
   */
  search(queryEmbedding: number[], topK: number = 3): SearchResult[] {
    if (this.entries.length === 0) {
      return [];
    }

    // Compute similarity for all entries
    const scored: SearchResult[] = this.entries.map((entry) => ({
      entry,
      score: cosineSimilarity(queryEmbedding, entry.embedding),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Return top K
    return scored.slice(0, topK);
  }

  /**
   * Get an entry by ID.
   */
  get(id: string): VectorEntry | undefined {
    const index = this.idIndex.get(id);
    if (index === undefined) return undefined;
    return this.entries[index];
  }

  /**
   * Remove an entry by ID.
   *
   * @returns true if the entry was found and removed
   */
  remove(id: string): boolean {
    const index = this.idIndex.get(id);
    if (index === undefined) return false;

    this.entries.splice(index, 1);
    this.rebuildIndex();
    return true;
  }

  /**
   * Clear all entries from the store.
   */
  clear(): void {
    this.entries = [];
    this.idIndex.clear();
  }

  /**
   * Get the number of entries in the store.
   */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Get all entries (for serialization/export).
   */
  getAll(): VectorEntry[] {
    return [...this.entries];
  }

  /**
   * Export store data as a JSON-serializable object.
   */
  toJSON(): { entries: VectorEntry[] } {
    return { entries: this.entries };
  }

  /**
   * Import entries from a JSON object.
   */
  static fromJSON(data: { entries: VectorEntry[] }): VectorStore {
    const store = new VectorStore();
    store.addBatch(data.entries);
    return store;
  }

  /**
   * Rebuild the ID index after mutations.
   */
  private rebuildIndex(): void {
    this.idIndex.clear();
    for (let i = 0; i < this.entries.length; i++) {
      this.idIndex.set(this.entries[i]!.id, i);
    }
  }
}
