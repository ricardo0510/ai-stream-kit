// ============================================================================
// AI-Stream-Kit — React Adapter
// ============================================================================
// Provides a `useAIStream` React Hook for seamless integration.
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
 * Options for the useAIStream hook.
 */
export interface UseAIStreamOptions {
  /** SSE client configuration (url, method, headers, etc.) */
  sseOptions: Omit<SSEClientOptions, 'onMessage' | 'onError' | 'onOpen' | 'onClose' | 'signal'>;
  /** Markdown renderer configuration */
  rendererOptions?: StreamRendererOptions;
  /** Extract text content from SSE event data (default: parse JSON and get .text or .content) */
  extractText?: (event: SSEEvent) => string | null;
  /** Callback when stream completes */
  onComplete?: (fullText: string) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Auto-start the stream (default: false) */
  autoStart?: boolean;
}

/**
 * Return value of the useAIStream hook.
 */
export interface UseAIStreamReturn {
  /** Current rendered HTML output */
  html: string;
  /** Raw accumulated Markdown text */
  rawText: string;
  /** Whether the stream is currently active */
  isStreaming: boolean;
  /** Current connection state */
  connectionState: SSEConnectionState;
  /** Error if any */
  error: Error | null;
  /** Start the stream */
  start: (body?: string | Record<string, unknown>) => void;
  /** Stop/abort the stream */
  stop: () => void;
  /** Reset all state */
  reset: () => void;
}

/**
 * Default text extractor: tries to parse JSON and extract .text, .content, or .delta.content
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
 * React Hook for AI streaming with built-in Markdown rendering.
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

  // Initialize renderer
  useEffect(() => {
    rendererRef.current = new StreamMarkdownRenderer(options.rendererOptions);
    return () => {
      rendererRef.current?.reset();
    };
  }, []);

  const start = useCallback((body?: string | Record<string, unknown>) => {
    // Clean up previous connection
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clientRef.current?.close();
    };
  }, []);

  // Auto-start if configured
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
