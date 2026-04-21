// ============================================================================
// AI-Stream-Kit — Cosine Similarity (Pure Math)
// ============================================================================
// No external dependencies — pure mathematical implementation of
// cosine similarity for vector comparison.
//
// Formula: cos(θ) = (A · B) / (||A|| × ||B||)
// ============================================================================

/**
 * Compute the cosine similarity between two vectors.
 *
 * @param a - First vector
 * @param b - Second vector (must be same dimension as `a`)
 * @returns Similarity score in range [-1, 1], where 1 = identical direction
 * @throws Error if vectors have different dimensions or zero length
 *
 * @example
 * ```ts
 * cosineSimilarity([1, 0, 0], [1, 0, 0]); // => 1.0  (identical)
 * cosineSimilarity([1, 0, 0], [0, 1, 0]); // => 0.0  (orthogonal)
 * cosineSimilarity([1, 0, 0], [-1, 0, 0]); // => -1.0 (opposite)
 * ```
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`
    );
  }

  if (a.length === 0) {
    throw new Error('Cannot compute similarity of zero-length vectors');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);

  // Handle zero vectors
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * Compute the Euclidean distance between two vectors.
 * Useful as an alternative distance metric.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Distance (0 = identical, larger = more different)
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`
    );
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i]! - b[i]!;
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Compute the dot product of two vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Scalar dot product
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`
    );
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i]! * b[i]!;
  }

  return sum;
}

/**
 * Normalize a vector to unit length (L2 normalization).
 *
 * @param v - Input vector
 * @returns New vector with ||v|| = 1
 */
export function normalize(v: number[]): number[] {
  let norm = 0;
  for (let i = 0; i < v.length; i++) {
    norm += v[i]! * v[i]!;
  }
  norm = Math.sqrt(norm);

  if (norm === 0) return new Array(v.length).fill(0) as number[];

  return v.map((x) => x / norm);
}
