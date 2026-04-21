// ============================================================================
// AI-Stream-Kit — Main Entry Point
// ============================================================================
// Unified exports for the entire SDK.
// ============================================================================

// --- Core: SSE Client ---
export { createSSEClient } from './core/sse-client.js';
export { SSEParser } from './core/sse-parser.js';
export {
  calculateDelay,
  shouldRetry,
  waitForRetry,
  resolveRetryOptions,
  DEFAULT_RETRY_OPTIONS,
} from './core/retry-strategy.js';

// --- Core: Types ---
export type {
  SSEEvent,
  SSEClientOptions,
  SSEClientInstance,
  SSEConnectionState,
  RetryOptions,
  MarkdownTag,
  StreamRendererOptions,
  ChunkOptions,
  VectorEntry,
  SearchResult,
  EmbeddingManagerOptions,
  WorkerRequest,
  WorkerResponse,
} from './core/types.js';
export { SSEClientError } from './core/types.js';

// --- Renderer ---
export { autoClose } from './renderer/auto-close.js';
export { StreamMarkdownRenderer } from './renderer/markdown-renderer.js';
export {
  RenderScheduler,
  NodeRenderScheduler,
} from './renderer/debounce-render.js';

// --- RAG ---
export { chunkText, DEFAULT_CHUNK_OPTIONS } from './rag/chunker.js';
export {
  cosineSimilarity,
  euclideanDistance,
  dotProduct,
  normalize,
} from './rag/similarity.js';
export { VectorStore } from './rag/vector-store.js';
export { EmbeddingManager } from './rag/embedding-manager.js';
