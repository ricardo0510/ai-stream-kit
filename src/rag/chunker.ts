// ============================================================================
// AI-Stream-Kit — RAG 文本切片分块器 (Text Chunker for RAG)
// ============================================================================
// 用以将超长篇幅文本切割成包含重叠字数的碎块，以便喂给嵌入模型。
// 采用降级策略机制执行：尽可能选择保留人类语言语境边界（先找段落 > 再找整句 > 再找词汇），
// 在万不得已找不到天然截断点时才会降级触发等长字幅粗暴截断机制。
// ============================================================================

import type { ChunkOptions } from '../core/types.js';

/**
 * 默认推崇的分块首选配置项。
 */
export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  chunkSize: 500,
  overlap: 50,
  separators: ['\n\n', '\n', '。', '. ', '；', '; ', '，', ', ', ' '],
};

/**
 * 对长文本进行妥善地智能分块，并自带承上启下的重叠率字数。
 *
 * @param text - 等待切割开来的整段文本
 * @param options - 允许用户覆盖重写切割逻辑的配置项
 * @returns 已经被切得适合喂饭给模型的小数组块了
 *
 * @example
 * ```ts
 * const chunks = chunkText(longDocument, { chunkSize: 500, overlap: 50 });
 * // => ['前500个单词...', '...包含重叠的50个词 + 向后推延450字符的段落...', ...]
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
 * 遵循不同界限标号层级而依次迭代下放的拆分法宝。
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
 * 将打散重组后的短文本根据体积大小限制来合并粘贴成合格完整的输出 Chunk 块。
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
 * 迫不得已降级启动的最简单的按纯纯长短字符一刀切的兜底分裂法。
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
