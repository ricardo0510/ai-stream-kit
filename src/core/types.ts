// ============================================================================
// AI-Stream-Kit — Core Type Definitions
// ============================================================================

/**
 * 从数据流中解析出的单个 Server-Sent Event (SSE) 对象。
 */
export interface SSEEvent {
  /** 事件 ID，用于断开时的 Last-Event-ID 重连恢复 */
  id?: string;
  /** 事件类型 (默认为 "message") */
  event?: string;
  /** 事件数据负载内容 */
  data: string;
  /** 服务器建议的重试间隔时间（毫秒） */
  retry?: number;
}

/**
 * SSE 客户端断线重连的重试策略配置。
 */
export interface RetryOptions {
  /** 最大尝试重连次数 (默认: 5) */
  maxRetries: number;
  /** 指数退避的基础延迟毫秒数 (默认: 1000) */
  baseDelay: number;
  /** 延迟的时间上限毫秒数 (默认: 30000) */
  maxDelay: number;
  /** 是否添加随机抖动，以防止大量客户端同一时刻疯狂重连产生雪崩效应 (默认: true) */
  jitter: boolean;
}

/**
 * SSE 客户端实例化配置选项。
 */
export interface SSEClientOptions {
  /** SSE 连接目标 URL */
  url: string;
  /** HTTP 请求方法 (默认: "GET") */
  method?: 'GET' | 'POST';
  /** 自定义请求头 */
  headers?: Record<string, string>;
  /** POST 请求的请求体 */
  body?: string | Record<string, unknown>;
  /** 用于用户主动取消请求的 AbortSignal 控制器信号 */
  signal?: AbortSignal;
  /** 重试策略配置 */
  retry?: Partial<RetryOptions>;
  /** 初始的 Last-Event-ID 用于接续之前的流 */
  lastEventId?: string;
  /** 每当接收到一个完整的 SSE 事件时触发的回调 */
  onMessage?: (event: SSEEvent) => void;
  /** 错误回调函数 */
  onError?: (error: SSEClientError) => void;
  /** 连接成功建立时的回调 */
  onOpen?: () => void;
  /** 连接关闭 (且不再重试) 时的回调 */
  onClose?: () => void;
  /** 是否根据事件 ID 去除重复接收的数据 (默认: true) */
  deduplicate?: boolean;
}

/**
 * 针对 SSE 客户端错误自定义封装的报错类。
 */
export class SSEClientError extends Error {
  /** 具体的 HTTP 状态码（如果有） */
  readonly statusCode?: number;
  /** 这个错误是否允许重新尝试连接 */
  readonly retryable: boolean;
  /** 引发该错误的原始 Error 堆栈 */
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
 * 描述了当前 SSE 客户端的连接生命周期状态。
 */
export type SSEConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closed';

/**
 * 调用 createSSEClient 所返回的客户端实例化对象。
 */
export interface SSEClientInstance {
  /** 彻底关闭连接并停止后续所有重试 */
  close(): void;
  /** 获取当前内部的实时连接状态 */
  readonly state: SSEConnectionState;
  /** 记录目前收到的最后一条事件的 ID */
  readonly lastEventId: string | undefined;
}

// ============================================================================
// Renderer Types
// ============================================================================

/**
 * auto-close 自动闭合算法所监听的 Markdown 语法标签。
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
 * 流式 Markdown 渲染引擎的配置选项。
 */
export interface StreamRendererOptions {
  /** 自定义的 Markdown 到 HTML 转换器函数。如果没有提供，渲染器只会简单返回补全后的原始 md 数据。 */
  markdownToHtml?: (markdown: string) => string;
  /** 要绑定的渲染目标 DOM 元素（仅限浏览器环境） */
  container?: HTMLElement;
  /** 每当接收内容更新时，是否自动帮容器滚动到底部 (默认: true) */
  autoScroll?: boolean;
  /** 支持自定义的代码块高亮器回调 */
  codeHighlighter?: (code: string, lang: string) => string;
}

// ============================================================================
// RAG Types
// ============================================================================

/**
 * 把长文本材料分块切片时的配置项。
 */
export interface ChunkOptions {
  /** 每个分块允许的最大字符数 (默认: 500) */
  chunkSize: number;
  /** 为了防止上下文语义断裂，相邻区块间的重叠冗余字数 (默认: 50) */
  overlap: number;
  /** 自定义切分依据的分隔符数组，按顺序做降级尝试 (默认: ['\n\n', '\n', '. ', ' ']) */
  separators: string[];
}

/**
 * 向量库中存放的单一实例结构。
 */
export interface VectorEntry {
  /** 唯一标识符 */
  id: string;
  /** 原始文本内容 */
  text: string;
  /** 文本映射出的嵌入数组(向量化)结果 */
  embedding: number[];
  /** 可选的附加过滤元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 向量比较后检索产生的结果携带信息。
 */
export interface SearchResult {
  /** 匹配找到的向量记录 */
  entry: VectorEntry;
  /** 此条记录与查询基准的余弦相似度打分 (数值在 -1 ~ 1 之间，越高越接近) */
  score: number;
}

/**
 * RAG Web Worker 管理器的配置设定。
 */
export interface EmbeddingManagerOptions {
  /** 指定 HuggingFace 上的模型 ID (默认: "Xenova/all-MiniLM-L6-v2") */
  model?: string;
  /** 端侧算力底层选择 (默认: 自动探测适配，且优先考虑 "webgpu") */
  device?: 'webgpu' | 'wasm' | 'auto';
  /** 当模型下载读取时的进度回调函数 */
  onProgress?: (stage: string, progress: number) => void;
}

// ============================================================================
// Worker Message Protocol
// ============================================================================

/**
 * 表示从浏览器主线程发往 Web Worker 子线程的消息格式。
 */
export type WorkerRequest =
  | { type: 'init'; model: string; device: 'webgpu' | 'wasm' }
  | { type: 'embed'; id: string; texts: string[] };

/**
 * 表示 Web Worker 算力层返回到主线程的消息内容类型格式。
 */
export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; id: string; embeddings: number[][] }
  | { type: 'error'; id: string; message: string }
  | { type: 'progress'; stage: string; progress: number };
