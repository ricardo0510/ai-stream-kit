// ============================================================================
// AI-Stream-Kit — Text Chunker for RAG
// ============================================================================
// Splits documents into overlapping chunks for embedding generation.
// Uses a hierarchical separator strategy: tries to split at natural
// boundaries (paragraphs > sentences > words) before falling back
// to character-level splitting.
// ============================================================================

import type { ChunkOptions } from '../core/types.js';

/**
 * Default chunking options.
 */
export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  chunkSize: 500,
  overlap: 50,
  separators: ['\n\n', '\n', '。', '. ', '；', '; ', '，', ', ', ' '],
};

/**
 * Split text into overlapping chunks suitable for embedding generation.
 *
 * @param text - The input text to split
 * @param options - Chunking configuration (partial, merged with defaults)
 * @returns Array of text chunks
 *
 * @example
 * ```ts
 * const chunks = chunkText(longDocument, { chunkSize: 500, overlap: 50 });
 * // => ['First 500 chars...', '...overlapping 50 chars + next 450...', ...]
 * ```
 */
export function chunkText(
  text: string,
  options?: Partial<ChunkOptions>
): string[] {
  const opts: ChunkOptions = {
    ...DEFAULT_CHUNK_OPTIONS,
    ...options,
  };

  if (!text || text.trim().length === 0) {
    return [];
  }

  // If text is short enough, return as single chunk
  if (text.length <= opts.chunkSize) {
    return [text.trim()];
  }

  return recursiveSplit(text, opts.separators, opts.chunkSize, opts.overlap);
}

/**
 * Recursively split text by trying separators in priority order.
 */
function recursiveSplit(
  text: string,
  separators: string[],
  chunkSize: number,
  overlap: number
): string[] {
  // Base case: text fits in a single chunk
  if (text.length <= chunkSize) {
    const trimmed = text.trim();
    return trimmed ? [trimmed] : [];
  }

  // Try each separator in order
  for (const sep of separators) {
    const splits = text.split(sep);
    if (splits.length <= 1) continue;

    // This separator works — merge splits into chunks
    return mergeSplitsIntoChunks(splits, sep, chunkSize, overlap);
  }

  // No separator worked — fall back to character-level splitting
  return characterSplit(text, chunkSize, overlap);
}

/**
 * Merge split segments into chunks that respect the size limit.
 */
function mergeSplitsIntoChunks(
  splits: string[],
  separator: string,
  chunkSize: number,
  overlap: number
): string[] {
  const chunks: string[] = [];
  let currentParts: string[] = [];
  let currentLength = 0;

  for (const split of splits) {
    const addLength = currentParts.length > 0
      ? separator.length + split.length
      : split.length;

    if (currentLength + addLength > chunkSize && currentParts.length > 0) {
      // Current chunk is full — emit it
      const chunk = currentParts.join(separator).trim();
      if (chunk) chunks.push(chunk);

      // Compute overlap: keep trailing parts that fit within overlap window
      const overlapParts: string[] = [];
      let overlapLength = 0;
      for (let i = currentParts.length - 1; i >= 0; i--) {
        const part = currentParts[i]!;
        const newLength = overlapLength + part.length + (overlapParts.length > 0 ? separator.length : 0);
        if (newLength > overlap) break;
        overlapParts.unshift(part);
        overlapLength = newLength;
      }

      currentParts = [...overlapParts, split];
      currentLength = currentParts.join(separator).length;
    } else {
      currentParts.push(split);
      currentLength += addLength;
    }
  }

  // Emit remaining
  if (currentParts.length > 0) {
    const chunk = currentParts.join(separator).trim();
    if (chunk) chunks.push(chunk);
  }

  return chunks;
}

/**
 * Character-level splitting as a last resort.
 */
function characterSplit(
  text: string,
  chunkSize: number,
  overlap: number
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);

    if (end >= text.length) break;
    start = end - overlap;
  }

  return chunks;
}
