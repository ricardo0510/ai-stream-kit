// ============================================================================
// AI-Stream-Kit — Embedding Manager (Main Thread)
// ============================================================================
// Wraps Web Worker communication in a clean Promise-based API.
// Handles worker lifecycle, request queuing, and error recovery.
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
 * Promise resolver stored for pending requests.
 */
interface PendingRequest {
  resolve: (embeddings: number[][]) => void;
  reject: (error: Error) => void;
}

/**
 * EmbeddingManager orchestrates client-side embedding generation
 * by delegating inference to a Web Worker.
 *
 * @example
 * ```ts
 * const manager = new EmbeddingManager({
 *   model: 'Xenova/all-MiniLM-L6-v2',
 *   device: 'auto',
 *   onProgress: (stage, progress) => {
 *     console.log(`Loading: ${stage} ${(progress * 100).toFixed(0)}%`);
 *   },
 * });
 *
 * await manager.init();
 *
 * // Process a document
 * const store = await manager.processDocument(documentText);
 *
 * // Query
 * const results = await manager.retrieve('What is TypeScript?', store, 3);
 * console.log(results[0].entry.text); // Most relevant chunk
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
   * Initialize the worker and load the model.
   * Must be called before any embedding operations.
   *
   * @throws Error if initialization fails
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
   * Generate embeddings for an array of texts.
   *
   * @param texts - Array of strings to embed
   * @returns 2D array of embeddings
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
   * Process a document: chunk → embed → store in VectorStore.
   *
   * @param text - The full document text
   * @param chunkOptions - Chunking configuration
   * @returns A VectorStore containing all embedded chunks
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
   * Retrieve the most relevant chunks for a query.
   *
   * @param query - The search query text
   * @param store - The VectorStore to search in
   * @param topK - Number of results to return (default: 3)
   * @returns Array of search results with similarity scores
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
   * Check if the manager is initialized and ready.
   */
  get isReady(): boolean {
    return this.initialized;
  }

  /**
   * Dispose the manager and terminate the worker.
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
   * Handle messages from the worker.
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
   * Create the Web Worker instance.
   * Override this method to customize worker creation (e.g., for different bundlers).
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
   * Assert that the manager is initialized.
   */
  private assertInitialized(): void {
    if (!this.initialized || !this.worker) {
      throw new Error(
        'EmbeddingManager not initialized. Call init() first.'
      );
    }
  }
}
