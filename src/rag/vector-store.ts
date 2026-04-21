// ============================================================================
// AI-Stream-Kit — 纯前端内存向量数据库 (In-Memory Vector Store)
// ============================================================================
// 一个非常轻薄的，免于搭载任何依赖库直接生啃的前端微型向量存储站。
// 提供了基于内存环境的存、删、提取和利用余弦算进行 Top-K 横向排名比对功能。
// ============================================================================

import type { VectorEntry, SearchResult } from '../core/types.js';
import { cosineSimilarity } from './similarity.js';

/**
 * 使用本地内存空间实现的带有相似度智能搜索筛选能力的容器。
 *
 * @example
 * ```ts
 * const store = new VectorStore();
 *
 * store.add({
 *   id: 'chunk-1',
 *   text: 'TypeScript 是一门建立在 JS 上的超集语言。',
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
   * 将一枚实体塞入这座图书馆里头。
   * 要是之前早存在对应唯一辨识符号的纪录，将覆盖更新掉前身的资料痕迹。
   *
   * @param entry - 要记录起来的那条具有标识性质与向量特征的词条
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
   * 批处理功能，一口气提交灌注多个向量信息进去。
   *
   * @param entries - 海量记录集合
   */
  addBatch(entries: VectorEntry[]): void {
    for (const entry of entries) {
      this.add(entry);
    }
  }

  /**
   * 在这个小天地里面翻箱倒柜找出跟你要的那个目标相似度匹配的 Top 几 名数据实体材料。
   *
   * @param queryEmbedding - 被查询检索目标的向量坐标轴
   * @param topK - 限定抓取出多少条最贴切相关的对象 (默认是: 3条)
   * @returns 已自带根据优劣度降序整理规整完毕的信息表
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
   * 透过它的特有 ID 号把这根对应的实体凭空拉取出来。
   */
  get(id: string): VectorEntry | undefined {
    const index = this.idIndex.get(id);
    if (index === undefined) return undefined;
    return this.entries[index];
  }

  /**
   * 根据目标身上的身份铭牌(ID)把它狠心地踢除清理掉。
   *
   * @returns 假如确认在执行前此人还身在库中并完成了移交，它会发还 `true`。
   */
  remove(id: string): boolean {
    const index = this.idIndex.get(id);
    if (index === undefined) return false;

    this.entries.splice(index, 1);
    this.rebuildIndex();
    return true;
  }

  /**
   * 掀桌操作：将存放库所有留存的档案焚烧殆尽恢复白纸。
   */
  clear(): void {
    this.entries = [];
    this.idIndex.clear();
  }

  /**
   * 得知此刻小黑屋里总计收压扣留的人头数字信息。
   */
  get size(): number {
    return this.entries.length;
  }

  /**
   * 把底层保存着的原始资料数组全部提档暴露出去（经常被用来做整体内容的导出保存转存）。
   */
  getAll(): VectorEntry[] {
    return [...this.entries];
  }

  /**
   * 把存储内囊转化为能轻巧落笔落磁盘被转换成标准的 JSON 通讯形态。
   */
  toJSON(): { entries: VectorEntry[] } {
    return { entries: this.entries };
  }

  /**
   * 复读操作：吞服 JSON 产物并复原重建原模原样的 Vector Store 建筑。
   */
  static fromJSON(data: { entries: VectorEntry[] }): VectorStore {
    const store = new VectorStore();
    store.addBatch(data.entries);
    return store;
  }

  /**
   * 私底下将存放 ID 地图定位用的指针册进行重新洗牌排序跟进工作。
   */
  private rebuildIndex(): void {
    this.idIndex.clear();
    for (let i = 0; i < this.entries.length; i++) {
      this.idIndex.set(this.entries[i]!.id, i);
    }
  }
}
