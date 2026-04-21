// ============================================================================
// AI-Stream-Kit — RAG 词向量总控台 (Embedding Manager - Main Thread)
// ============================================================================
// 包装并托管了与 Web Worker 通信联系的底层机制，把异步消息拉平成规矩的 Promise API 接口。
// 它全权负责 Worker 的诞生与消亡、队列中排队的请求、以及错误恢复与重发拦截工作。
// ============================================================================

import type {
  EmbeddingManagerOptions,
  WorkerRequest,
  WorkerResponse,
  ChunkOptions,
  SearchResult,
} from '../core/types.js';
import { VectorStore } from './vector-store.js';
import { chunkText } from './chunker.js';

/**
 * 用于记录等待被召唤回去的悬空 Promise 对象体。
 */
interface PendingRequest {
  resolve: (embeddings: number[][]) => void;
  reject: (error: Error) => void;
}

/**
 * 专设于浏览器主线程的统战管理平台(EmbeddingManager)。
 * 它是调度向 Web Worker 甩手掌柜外包生成分析词嵌入向量过程的领头羊。
 *
 * @example
 * ```ts
 * const manager = new EmbeddingManager({
 *   model: 'Xenova/all-MiniLM-L6-v2',
 *   device: 'auto',
 *   onProgress: (stage, progress) => {
 *     console.log(`正在加载: ${stage} ${(progress * 100).toFixed(0)}%`);
 *   },
 * });
 *
 * await manager.init();
 *
 * // 一键消化喂给它的整篇散文长文
 * const store = await manager.processDocument(documentText);
 *
 * // 发起搜索拷问
 * const results = await manager.retrieve('TypeScript是什么？', store, 3);
 * console.log(results[0].entry.text); // 最贴题且包含真理的那一段
 *
 * manager.dispose();
 * ```
 */
export class EmbeddingManager {
  private worker: Worker | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private initialized: boolean = false;
  private requestCounter: number = 0;
  private readonly options: Required<EmbeddingManagerOptions>;

  constructor(options?: EmbeddingManagerOptions) {
    this.options = {
      model: options?.model ?? 'Xenova/all-MiniLM-L6-v2',
      device: options?.device ?? 'auto',
      onProgress: options?.onProgress ?? (() => {}),
    };
  }

  /**
   * 初始化建立启动干活的 worker 奴隶并强令其载入庞大的大模型网络。
   * 此 API 强制且必须先于所有后续计算操作流程进行调用触发。
   *
   * @throws 当建立模型读取或是分发失败时甩给你 Error 定时炸弹
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    return new Promise<void>((resolve, reject) => {
      // Create worker from the bundled worker file
      // Users need to configure their bundler to handle this
      this.worker = this.createWorker();

      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        this.handleWorkerMessage(event.data);
      };

      this.worker.onerror = (error: ErrorEvent) => {
        reject(new Error(`Worker error: ${error.message}`));
      };

      // Store init resolve/reject
      this.pendingRequests.set('__init__', {
        resolve: () => {
          this.initialized = true;
          resolve();
        },
        reject,
      });

      // Determine device
      let device: 'webgpu' | 'wasm' = 'wasm';
      if (this.options.device === 'auto' || this.options.device === 'webgpu') {
        // Try WebGPU first
        if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
          device = 'webgpu';
        }
      }

      const msg: WorkerRequest = {
        type: 'init',
        model: this.options.model,
        device,
      };
      this.worker.postMessage(msg);
    });
  }

  /**
   * 提供给批量字符串生硬地转换提取为数字特征多维坐标系的转换器。
   *
   * @param texts - 喂入模型咀嚼的一系列文本切片
   * @returns 换算后等长的空间坐标矩阵数组
   */
  async embed(texts: string[]): Promise<number[][]> {
    this.assertInitialized();

    const id = `embed_${++this.requestCounter}`;

    return new Promise<number[][]>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const msg: WorkerRequest = {
        type: 'embed',
        id,
        texts,
      };
      this.worker!.postMessage(msg);
    });
  }

  /**
   * 处理消化一篇文稿的完整车间流水线: 原文 → 切割分组 → 送检产码 → 造册收进向量库。
   *
   * @param text - 又长又臭没有任何排版的原文原句
   * @param chunkOptions - 你能够微调干涉切碎机的相关设定参数
   * @returns 包含被整顿收编好特征的知识索引库VectorStore本体
   */
  async processDocument(
    text: string,
    chunkOptions?: Partial<ChunkOptions>
  ): Promise<VectorStore> {
    this.assertInitialized();

    const chunks = chunkText(text, chunkOptions);

    if (chunks.length === 0) {
      return new VectorStore();
    }

    // Batch embed all chunks (process in groups of 32 to avoid memory issues)
    const batchSize = 32;
    const store = new VectorStore();
    let chunkIndex = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = await this.embed(batch);

      for (let j = 0; j < batch.length; j++) {
        store.add({
          id: `chunk_${chunkIndex++}`,
          text: batch[j]!,
          embedding: embeddings[j]!,
          metadata: {
            index: chunkIndex - 1,
            charOffset: text.indexOf(batch[j]!),
          },
        });
      }
    }

    return store;
  }

  /**
   * 提着你要找的话柄子，去找馆长(VectorStore)寻觅关系相近的片段。
   *
   * @param query - 要寻人启事的大概意思文字
   * @param store - 去那座藏书库里进行翻找
   * @param topK - 选头前几个最有可能中签的句子(默认传回三块)
   * @returns 富有说服力相似度计分的排列结构数组集
   */
  async retrieve(
    query: string,
    store: VectorStore,
    topK: number = 3
  ): Promise<SearchResult[]> {
    this.assertInitialized();

    const [queryEmbedding] = await this.embed([query]);
    if (!queryEmbedding) {
      throw new Error('Failed to generate query embedding');
    }

    return store.search(queryEmbedding, topK);
  }

  /**
   * 窥探当前车间和底盘管理人员是否均已就位能接受委托。
   */
  get isReady(): boolean {
    return this.initialized;
  }

  /**
   * 解散工人包工头并清理现场资源，顺带强制掐断打断那些遥遥无期干不完还没提交回应的任务清单。
   */
  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.initialized = false;

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error('EmbeddingManager disposed'));
    }
    this.pendingRequests.clear();
  }

  /**
   * 守站门卫：对接收到返回主干路口的所有由 Web Worker 投递过来的快报包裹做拆分识别与投递处理。
   */
  private handleWorkerMessage(msg: WorkerResponse): void {
    switch (msg.type) {
      case 'ready': {
        const initRequest = this.pendingRequests.get('__init__');
        if (initRequest) {
          this.pendingRequests.delete('__init__');
          initRequest.resolve([] as unknown as number[][]);
        }
        break;
      }

      case 'result': {
        const request = this.pendingRequests.get(msg.id);
        if (request) {
          this.pendingRequests.delete(msg.id);
          request.resolve(msg.embeddings);
        }
        break;
      }

      case 'error': {
        const errorRequest = this.pendingRequests.get(msg.id);
        if (errorRequest) {
          this.pendingRequests.delete(msg.id);
          errorRequest.reject(new Error(msg.message));
        }
        break;
      }

      case 'progress': {
        this.options.onProgress(msg.stage, msg.progress);
        break;
      }
    }
  }

  /**
   * 生成配置并创建一个标准的 Web Worker。
   * 当你需要应付并配合那些恶心的脚手架去改造导入规则时你可以重写重置覆盖这座函数的实现。
   */
  protected createWorker(): Worker {
    // Use a module worker with the embedded worker URL
    // This assumes the bundler (Vite/webpack) handles `new URL(..., import.meta.url)`
    return new Worker(
      new URL('./embedding.worker.js', import.meta.url),
      { type: 'module' }
    );
  }

  /**
   * 兜底防君子防不住小人，判断如果越权没加载直接强压就报错抛异常。
   */
  private assertInitialized(): void {
    if (!this.initialized || !this.worker) {
      throw new Error(
        'EmbeddingManager not initialized. Call init() first.'
      );
    }
  }
}
