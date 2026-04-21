// ============================================================================
// AI-Stream-Kit — 统一包入口出口导向区 (Main Entry Point)
// ============================================================================
// 把整个 SDK 家族成员梳理分类打包统一呈现代替模块向外抛出。
// ============================================================================

// --- 核心区: 服务器推送客户端 (Core: SSE Client) ---
export { createSSEClient } from './core/sse-client.js';
export { SSEParser } from './core/sse-parser.js';
export {
  calculateDelay,
  shouldRetry,
  waitForRetry,
  resolveRetryOptions,
  DEFAULT_RETRY_OPTIONS,
} from './core/retry-strategy.js';

// --- 核心区: 类型定义 (Core: Types) ---
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

// --- 表面渲染区: Markdown 流式输出缓冲带 (Renderer) ---
export { autoClose } from './renderer/auto-close.js';
export { StreamMarkdownRenderer } from './renderer/markdown-renderer.js';
export {
  RenderScheduler,
  NodeRenderScheduler,
} from './renderer/debounce-render.js';

// --- 外挂区: 检索增强生成 (RAG) ---
export { chunkText, DEFAULT_CHUNK_OPTIONS } from './rag/chunker.js';
export {
  cosineSimilarity,
  euclideanDistance,
  dotProduct,
  normalize,
} from './rag/similarity.js';
export { VectorStore } from './rag/vector-store.js';
export { EmbeddingManager } from './rag/embedding-manager.js';
