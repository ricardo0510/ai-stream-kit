// ============================================================================
// AI-Stream-Kit — 余弦相似度 (Cosine Similarity (Pure Math))
// ============================================================================
// 该模块不搭载多余的库，仅使用纯数学算法来进行向量间的比对评估。
//
// 公式: cos(θ) = (A · B) / (||A|| × ||B||)
// ============================================================================

/**
 * 计算两个等长浮点方向量之间的余弦相似度。
 *
 * @param a - 第一个测试向量
 * @param b - 第二个与之对应的打靶向量
 * @returns 算出其相似度介于 [-1, 1] 之间。 1代表方向高度重合，0代表风马牛不相及
 * @throws 维度匹配失败时会触发 Error 保护报错
 *
 * @example
 * ```ts
 * cosineSimilarity([1, 0, 0], [1, 0, 0]); // => 1.0  (一模一样)
 * cosineSimilarity([1, 0, 0], [0, 1, 0]); // => 0.0  (正交无关)
 * cosineSimilarity([1, 0, 0], [-1, 0, 0]); // => -1.0 (背道而驰)
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
 * 求得两个空间点坐标的最短直线距离(欧几里得距离)。
 * 这是在部分场合能取代余弦测算法的一样手段。
 *
 * @param a - 出发坐标点
 * @param b - 目标落脚点
 * @returns 返回算出的标量距长 (0 分开不差毫厘，越大证明隔阂越深)
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
 * 算出两个多维度空间内的特征方向向量的点乘 (Dot Product)。
 *
 * @param a - A向特征量
 * @param b - B向特征量
 * @returns 数字标量值
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
 * 将传如的向量量级进行所谓的 L2 范式单位标准化(L2 Normalization)。
 *
 * @param v - 获取带长短幅度的特征量
 * @returns 指针相同但量级全归 1 的新兵向量
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
