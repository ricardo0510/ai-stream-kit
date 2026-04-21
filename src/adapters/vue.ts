// ============================================================================
// AI-Stream-Kit — Vue 适配器 (Vue Adapter)
// ============================================================================
// 提供了一个 `useAIStream` Vue Composable 函数，用于在 Vue 中无缝集成流式 AI 聊天响应。
// 它可以自动响应式地管理流的生命周期、进行 Markdown 渲染以及处理连接断开释放。
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
 * useAIStream 组合式函数(Composable)的配置选项。
 */
export interface UseAIStreamOptions {
  /** SSE 客户端配置 (包含 url, method, 等) */
  sseOptions: Omit<SSEClientOptions, 'onMessage' | 'onError' | 'onOpen' | 'onClose' | 'signal'>;
  /** Markdown 渲染器配置选项 */
  rendererOptions?: StreamRendererOptions;
  /** 
   * 从 SSE 事件中提取解析文本的回调。
   * (默认: 尝试解析 JSON 并获取 .text, .content 或者 .delta.content 字段) 
   */
  extractText?: (event: SSEEvent) => string | null;
  /** 流接收完成并渲染结束时的回调函数，含完整的纯文本 */
  onComplete?: (fullText: string) => void;
  /** 捕获错误的回调函数 */
  onError?: (error: Error) => void;
}

/**
 * useAIStream 组合式函数的返回值。
 */
export interface UseAIStreamReturn {
  /** 经过 Markdown 渲染及标签自动闭合修复后的最终 HTML */
  html: Ref<string>;
  /** SSE 读取到的未闭合/原始 Markdown 数据 */
  rawText: Ref<string>;
  /** 是否当前正处于接收数据流状态中 */
  isStreaming: Ref<boolean>;
  /** 连接状态 ('idle' | 'connected' | 'closed') */
  connectionState: Ref<SSEConnectionState>;
  /** SSE 或渲染时产生的报错信息 */
  error: Ref<Error | null>;
  /** 开始流式请求，可传入或覆盖请求体的 Body */
  start: (body?: string | Record<string, unknown>) => void;
  /** 手动立刻中断流式请求 */
  stop: () => void;
  /** 中断数据流并将积累的数据与状态还原清空 */
  reset: () => void;
}

/**
 * 默认提取器，尝试兼容 OpenAI 及常规平台的 API 响应报文格式
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
 * 带有内建 Markdown 渲染管线的 Vue Composable (AI流数据接收Hook)。
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
    // 如果上次请求还在进行中，先终止它
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

  // 当组件被卸载时，自动终止请求以释放内存并阻断网络开销
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
