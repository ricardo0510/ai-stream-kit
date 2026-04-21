// ============================================================================
// AI-Stream-Kit — Core Type Definitions
// ============================================================================

/**
 * A single Server-Sent Event parsed from the stream.
 */
export interface SSEEvent {
  /** Event ID, used for Last-Event-ID reconnection */
  id?: string;
  /** Event type (defaults to "message") */
  event?: string;
  /** Event data payload */
  data: string;
  /** Server-suggested retry interval in milliseconds */
  retry?: number;
}

/**
 * Retry strategy configuration for SSE client reconnection.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 5) */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelay: number;
  /** Maximum delay cap in milliseconds (default: 30000) */
  maxDelay: number;
  /** Add random jitter to prevent thundering herd (default: true) */
  jitter: boolean;
}

/**
 * SSE client configuration options.
 */
export interface SSEClientOptions {
  /** Target URL for the SSE connection */
  url: string;
  /** HTTP method (default: "GET") */
  method?: 'GET' | 'POST';
  /** Custom request headers */
  headers?: Record<string, string>;
  /** Request body (for POST requests) */
  body?: string | Record<string, unknown>;
  /** AbortSignal for user-initiated cancellation */
  signal?: AbortSignal;
  /** Retry configuration */
  retry?: Partial<RetryOptions>;
  /** Initial Last-Event-ID for resumption */
  lastEventId?: string;
  /** Callback for each received SSE event */
  onMessage?: (event: SSEEvent) => void;
  /** Callback for errors */
  onError?: (error: SSEClientError) => void;
  /** Callback when connection is established */
  onOpen?: () => void;
  /** Callback when connection is closed (no more retries) */
  onClose?: () => void;
  /** Enable deduplication based on event ID (default: true) */
  deduplicate?: boolean;
}

/**
 * Custom error class for SSE client errors.
 */
export class SSEClientError extends Error {
  /** HTTP status code if applicable */
  readonly statusCode?: number;
  /** Whether the error is retryable */
  readonly retryable: boolean;
  /** The original error that caused this error */
  readonly cause?: Error;

  constructor(
    message: string,
    options?: { statusCode?: number; retryable?: boolean; cause?: Error }
  ) {
    super(message);
    this.name = 'SSEClientError';
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable ?? true;
    this.cause = options?.cause;
  }
}

/**
 * SSE client connection state.
 */
export type SSEConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closed';

/**
 * SSE client instance returned by createSSEClient.
 */
export interface SSEClientInstance {
  /** Close the connection and stop retrying */
  close(): void;
  /** Current connection state */
  readonly state: SSEConnectionState;
  /** Last received event ID */
  readonly lastEventId: string | undefined;
}

// ============================================================================
// Renderer Types
// ============================================================================

/**
 * Markdown tag types tracked by the auto-close algorithm.
 */
export type MarkdownTag =
  | { type: 'bold'; marker: '**' | '__' }
  | { type: 'italic'; marker: '*' | '_' }
  | { type: 'strikethrough'; marker: '~~' }
  | { type: 'inlineCode'; marker: '`' }
  | { type: 'codeBlock'; marker: string; lang?: string }
  | { type: 'link'; phase: 'text' | 'url' }
  | { type: 'image'; phase: 'alt' | 'url' };

/**
 * Stream Markdown renderer configuration.
 */
export interface StreamRendererOptions {
  /** Custom Markdown-to-HTML converter. If not provided, returns raw patched markdown. */
  markdownToHtml?: (markdown: string) => string;
  /** Target DOM element for rendering (browser only) */
  container?: HTMLElement;
  /** Auto-scroll container to bottom on update (default: true) */
  autoScroll?: boolean;
  /** Code block highlighter */
  codeHighlighter?: (code: string, lang: string) => string;
}

// ============================================================================
// RAG Types
// ============================================================================

/**
 * Text chunking options.
 */
export interface ChunkOptions {
  /** Maximum characters per chunk (default: 500) */
  chunkSize: number;
  /** Overlap between adjacent chunks (default: 50) */
  overlap: number;
  /** Custom separators, tried in order (default: ['\n\n', '\n', '. ', ' ']) */
  separators: string[];
}

/**
 * A single entry in the vector store.
 */
export interface VectorEntry {
  /** Unique identifier */
  id: string;
  /** Original text content */
  text: string;
  /** Embedding vector */
  embedding: number[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Search result from vector store.
 */
export interface SearchResult {
  /** The matched entry */
  entry: VectorEntry;
  /** Similarity score (0-1, higher is better) */
  score: number;
}

/**
 * Embedding manager configuration.
 */
export interface EmbeddingManagerOptions {
  /** HuggingFace model ID (default: "Xenova/all-MiniLM-L6-v2") */
  model?: string;
  /** Compute device (default: auto-detect, prefers "webgpu") */
  device?: 'webgpu' | 'wasm' | 'auto';
  /** Progress callback for model loading */
  onProgress?: (stage: string, progress: number) => void;
}

// ============================================================================
// Worker Message Protocol
// ============================================================================

/**
 * Messages sent from main thread to worker.
 */
export type WorkerRequest =
  | { type: 'init'; model: string; device: 'webgpu' | 'wasm' }
  | { type: 'embed'; id: string; texts: string[] };

/**
 * Messages sent from worker to main thread.
 */
export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; id: string; embeddings: number[][] }
  | { type: 'error'; id: string; message: string }
  | { type: 'progress'; stage: string; progress: number };
