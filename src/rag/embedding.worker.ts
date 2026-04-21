// ============================================================================
// AI-Stream-Kit — 算力池专属工兵子线程 (Embedding Web Worker)
// ============================================================================
// 一脚把负责吃算力的 Transformers.js 推理模块踢出主线程以避免浏览器界面彻底宕机卡死。
//
// 上下级交流协议频道:
//   主线程送出 → 此地: { type: 'init', model, device } | { type: 'embed', id, texts }
//   此地返回给 → 主线程: { type: 'ready' } | { type: 'result', id, embeddings }
//                 | { type: 'error', id, message } | { type: 'progress', stage, progress }
//
// 此处的线程程序由于具备动态按需加载懒依赖拉取 @huggingface/transformers 库，
// 并做到了一生只有一次 Pipeline (转换管线)载入的大缓存复用机制。
// ============================================================================

import type { WorkerRequest, WorkerResponse } from '../core/types.js';

// Type for the transformers pipeline (dynamic import)
type Pipeline = (texts: string[], options?: Record<string, unknown>) => Promise<{ tolist: () => number[][] }>;

let pipeline: Pipeline | null = null;

/**
 * 带有类型推断护体的事件广播抛掷函数（往主系统主线程传递信息专用）。
 */
function postTypedMessage(msg: WorkerResponse): void {
  self.postMessage(msg);
}

/**
 * 执行首启动前的准备工作并引入那庞大的远端计算转换工厂设施体系 Pipeline。
 */
async function initPipeline(model: string, device: 'webgpu' | 'wasm'): Promise<void> {
  try {
    postTypedMessage({ type: 'progress', stage: 'loading_library', progress: 0 });

    // Dynamic import to avoid bundling transformers.js with the main package
    const transformers = await import(
      /* webpackIgnore: true */
      '@huggingface/transformers'
    );

    postTypedMessage({ type: 'progress', stage: 'loading_model', progress: 0.2 });

    // Attempt to use the requested device, fall back to wasm
    let actualDevice = device;
    if (device === 'webgpu') {
      try {
        // Check WebGPU availability in worker context
        const gpu = (self as unknown as { navigator?: { gpu?: unknown } }).navigator?.gpu;
        if (!gpu) {
          console.warn('[ai-stream-kit] WebGPU not available in worker, falling back to wasm');
          actualDevice = 'wasm';
        }
      } catch {
        actualDevice = 'wasm';
      }
    }

    postTypedMessage({ type: 'progress', stage: 'initializing_pipeline', progress: 0.4 });

    const pipe = await transformers.pipeline(
      'feature-extraction',
      model,
      {
        device: actualDevice,
        progress_callback: (progress: { progress?: number; status?: string }) => {
          if (progress.progress !== undefined) {
            postTypedMessage({
              type: 'progress',
              stage: progress.status ?? 'loading_model',
              progress: 0.4 + (progress.progress / 100) * 0.5,
            });
          }
        },
      }
    );

    pipeline = pipe as unknown as Pipeline;

    postTypedMessage({ type: 'progress', stage: 'ready', progress: 1 });
    postTypedMessage({ type: 'ready' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to initialize pipeline';
    postTypedMessage({ type: 'error', id: '__init__', message });
  }
}

/**
 * 受主线程所托，利用手里已经装配好的机群体系为指定的批量文本生成出具有特性的嵌入值产物组。
 */
async function generateEmbeddings(id: string, texts: string[]): Promise<void> {
  if (!pipeline) {
    postTypedMessage({
      type: 'error',
      id,
      message: 'Pipeline not initialized. Send "init" message first.',
    });
    return;
  }

  try {
    const output = await pipeline(texts, {
      pooling: 'mean',
      normalize: true,
    });

    const embeddings = output.tolist();

    postTypedMessage({
      type: 'result',
      id,
      embeddings,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Embedding generation failed';
    postTypedMessage({ type: 'error', id, message });
  }
}

/**
 * 打到子线程域里的专用接线生监听大网口程序。
 */
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'init':
      initPipeline(msg.model, msg.device);
      break;

    case 'embed':
      generateEmbeddings(msg.id, msg.texts);
      break;

    default:
      postTypedMessage({
        type: 'error',
        id: '__unknown__',
        message: `Unknown message type: ${(msg as { type: string }).type}`,
      });
  }
};
