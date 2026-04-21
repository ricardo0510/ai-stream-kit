// ============================================================================
// AI-Stream-Kit — Vue Adapter
// ============================================================================
// Provides a `useAIStream` Vue Composable for seamless integration.
// ============================================================================

import { ref, onUnmounted, type Ref } from 'vue';
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
 * Options for the useAIStream composable.
 */
export interface UseAIStreamOptions {
  /** SSE client configuration */
  sseOptions: Omit<SSEClientOptions, 'onMessage' | 'onError' | 'onOpen' | 'onClose' | 'signal'>;
  /** Markdown renderer configuration */
  rendererOptions?: StreamRendererOptions;
  /** Extract text from SSE event (default: parse JSON and get .text/.content) */
  extractText?: (event: SSEEvent) => string | null;
  /** Callback when stream completes */
  onComplete?: (fullText: string) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

/**
 * Return value of the useAIStream composable.
 */
export interface UseAIStreamReturn {
  html: Ref<string>;
  rawText: Ref<string>;
  isStreaming: Ref<boolean>;
  connectionState: Ref<SSEConnectionState>;
  error: Ref<Error | null>;
  start: (body?: string | Record<string, unknown>) => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Default text extractor.
 */
function defaultExtractText(event: SSEEvent): string | null {
  if (event.data === '[DONE]') return null;

  try {
    const parsed = JSON.parse(event.data);
    if (parsed.choices?.[0]?.delta?.content) {
      return parsed.choices[0].delta.content;
    }
    if (typeof parsed.text === 'string') return parsed.text;
    if (typeof parsed.content === 'string') return parsed.content;
    return parsed;
  } catch {
    return event.data;
  }
}

/**
 * Vue Composable for AI streaming with built-in Markdown rendering.
 *
 * @example
 * ```vue
 * <script setup>
 * import { useAIStream } from 'ai-stream-kit/vue';
 *
 * const { html, isStreaming, start, stop } = useAIStream({
 *   sseOptions: {
 *     url: '/api/chat/stream',
 *     method: 'POST',
 *   },
 * });
 * </script>
 *
 * <template>
 *   <div v-html="html" />
 *   <button @click="start({ prompt: '你好' })">Send</button>
 *   <button v-if="isStreaming" @click="stop">Stop</button>
 * </template>
 * ```
 */
export function useAIStream(options: UseAIStreamOptions): UseAIStreamReturn {
  const html = ref('');
  const rawText = ref('');
  const isStreaming = ref(false);
  const connectionState = ref<SSEConnectionState>('idle');
  const error = ref<Error | null>(null);

  let client: SSEClientInstance | null = null;
  let abortController: AbortController | null = null;
  const renderer = new StreamMarkdownRenderer(options.rendererOptions);

  const extractText = options.extractText ?? defaultExtractText;

  function start(body?: string | Record<string, unknown>): void {
    // Clean up previous
    if (abortController) {
      abortController.abort();
    }

    abortController = new AbortController();
    error.value = null;
    isStreaming.value = true;
    renderer.reset();
    html.value = '';
    rawText.value = '';

    client = createSSEClient({
      ...options.sseOptions,
      body: body ?? options.sseOptions.body,
      signal: abortController.signal,
      onOpen() {
        connectionState.value = 'connected';
      },
      onMessage(event) {
        const text = extractText(event);
        if (text !== null) {
          const output = renderer.append(text);
          html.value = output;
          rawText.value = renderer.getRawMarkdown();
        }
      },
      onError(err) {
        error.value = err;
        options.onError?.(err);
      },
      onClose() {
        isStreaming.value = false;
        connectionState.value = 'closed';
        options.onComplete?.(renderer.getRawMarkdown());
      },
    });
  }

  function stop(): void {
    abortController?.abort();
    client?.close();
    isStreaming.value = false;
  }

  function reset(): void {
    stop();
    renderer.reset();
    html.value = '';
    rawText.value = '';
    error.value = null;
    connectionState.value = 'idle';
  }

  // Cleanup on component unmount
  onUnmounted(() => {
    abortController?.abort();
    client?.close();
  });

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
