// ============================================================================
// AI-Stream-Kit — React 适配器 (React Adapter)
// ============================================================================
// 提供了一个 `useAIStream` React Hook，用于无缝继承 AI 流式交互到 React 项目中。
// 它可以自动管理流的生命周期、进行 Markdown 渲染以及处理 AbortController (中止控制器)。
// ============================================================================

import { useState, useRef, useCallback, useEffect } from 'react';
import { createSSEClient } from '../core/sse-client.js';
import { StreamMarkdownRenderer } from '../renderer/markdown-renderer.js';
import type {
  SSEClientOptions,
  SSEClientInstance,
  SSEConnectionState,
  SSEEvent,
  StreamRendererOptions,
} from '../core/types.js';

/**
 * useAIStream Hook 的配置选项。
 */
export interface UseAIStreamOptions {
  /** SSE 客户端配置 (包含 url, method, headers 等)，排除了回调和 signal 因为它们由 Hook 内部管理 */
  sseOptions: Omit<SSEClientOptions, 'onMessage' | 'onError' | 'onOpen' | 'onClose' | 'signal'>;
  /** Markdown 渲染器配置选项 */
  rendererOptions?: StreamRendererOptions;
  /**
   * 从 SSE 事件数据中提取文本内容的自定义函数
   * (默认: 会尝试解析 JSON，然后获取 .text, .content, 或是 OpenAI 支持的 format)
   */
  extractText?: (event: SSEEvent) => string | null;
  /** 流完成时的回调，返回完整的文本内容 */
  onComplete?: (fullText: string) => void;
  /** 发生错误时的回调 */
  onError?: (error: Error) => void;
  /** 是否在组件挂载时自动开启流 (默认: false) */
  autoStart?: boolean;
}

/**
 * useAIStream Hook 的返回值。
 */
export interface UseAIStreamReturn {
  /** 经过 Markdown 渲染以及 auto-close 保底的当前 HTML 字符串内容 */
  html: string;
  /** 原始累积的 Markdown 文本内容 */
  rawText: string;
  /** 当前流是否处于活动 (接收) 状态 */
  isStreaming: boolean;
  /** 当前 SSE 连接状态 ('idle' | 'connected' | 'closed') */
  connectionState: SSEConnectionState;
  /** 连接或解析时发生的错误 (如果没有错误则为 null) */
  error: Error | null;
  /** 启动数据流。可以传入请求体 body 覆盖 sseOptions 中的默认请求体 */
  start: (body?: string | Record<string, unknown>) => void;
  /** 主动停止/中止当前数据流 */
  stop: () => void;
  /** 停止数据流并将内部所有的累积 HTML/文本 和 错误状态重置 */
  reset: () => void;
}

/**
 * 默认的文本提取器: 尝试解析 JSON 数据并提取 .text, .content 或者 .delta.content
 * 这个方法涵盖了主流的一些 API 返回格式，比如 OpenAI、Claude 等。
 */
function defaultExtractText(event: SSEEvent): string | null {
  if (event.data === '[DONE]') return null;

  try {
    const parsed = JSON.parse(event.data);
    // OpenAI-compatible format
    if (parsed.choices?.[0]?.delta?.content) {
      return parsed.choices[0].delta.content;
    }
    // Simple format
    if (typeof parsed.text === 'string') return parsed.text;
    if (typeof parsed.content === 'string') return parsed.content;
    // Raw string data
    return parsed;
  } catch {
    // Not JSON — return raw data
    return event.data;
  }
}

/**
 * 用于 AI 流式文本请求的 React Hook，内置 Markdown 渲染。
 * 它能够处理网络断开与重连配置，以及组件卸载时取消请求。
 *
 * @example
 * ```tsx
 * function ChatMessage() {
 *   const { html, isStreaming, start, stop } = useAIStream({
 *     sseOptions: {
 *       url: '/api/chat/stream',
 *       method: 'POST',
 *     },
 *   });
 *
 *   return (
 *     <div>
 *       <div dangerouslySetInnerHTML={{ __html: html }} />
 *       <button onClick={() => start({ prompt: '你好' })}>Send</button>
 *       {isStreaming && <button onClick={stop}>Stop</button>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useAIStream(options: UseAIStreamOptions): UseAIStreamReturn {
  const [html, setHtml] = useState('');
  const [rawText, setRawText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [connectionState, setConnectionState] = useState<SSEConnectionState>('idle');
  const [error, setError] = useState<Error | null>(null);

  const clientRef = useRef<SSEClientInstance | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rendererRef = useRef<StreamMarkdownRenderer | null>(null);

  const extractText = options.extractText ?? defaultExtractText;

  // 初始化 Markdown 流式渲染器
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    rendererRef.current = new StreamMarkdownRenderer(options.rendererOptions);
    return () => {
      rendererRef.current?.reset();
    };
  }, []);

  const start = useCallback((body?: string | Record<string, unknown>) => {
    // 如果当前已有进行中的请求连接，则先取消它
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const abortController = new AbortController();
    abortRef.current = abortController;

    setError(null);
    setIsStreaming(true);
    rendererRef.current?.reset();
    setHtml('');
    setRawText('');

    const client = createSSEClient({
      ...options.sseOptions,
      body: body ?? options.sseOptions.body,
      signal: abortController.signal,
      onOpen() {
        setConnectionState('connected');
      },
      onMessage(event) {
        const text = extractText(event);
        if (text !== null && rendererRef.current) {
          const output = rendererRef.current.append(text);
          setHtml(output);
          setRawText(rendererRef.current.getRawMarkdown());
        }
      },
      onError(err) {
        setError(err);
        options.onError?.(err);
      },
      onClose() {
        setIsStreaming(false);
        setConnectionState('closed');
        if (rendererRef.current) {
          options.onComplete?.(rendererRef.current.getRawMarkdown());
        }
      },
    });

    clientRef.current = client;
  }, [options.sseOptions, extractText, options.onComplete, options.onError]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    clientRef.current?.close();
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    rendererRef.current?.reset();
    setHtml('');
    setRawText('');
    setError(null);
    setConnectionState('idle');
  }, [stop]);

  // 初始化组件卸载时的清理动作，避免内存泄漏和无用请求
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clientRef.current?.close();
    };
  }, []);

  // 处理自动启动配置
  useEffect(() => {
    if (options.autoStart) {
      start();
    }
  }, [options.autoStart]);

  return {
    html,
    rawText,
    isStreaming,
    connectionState,
    error,
    start,
    stop,
    reset,
  };
}
