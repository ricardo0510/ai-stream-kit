// ============================================================================
// AI-Stream-Kit — Embedding Web Worker
// ============================================================================
// Runs Transformers.js inference OFF the main thread to prevent UI blocking.
//
// Communication protocol:
//   Main → Worker: { type: 'init', model, device } | { type: 'embed', id, texts }
//   Worker → Main: { type: 'ready' } | { type: 'result', id, embeddings }
//                  | { type: 'error', id, message } | { type: 'progress', stage, progress }
//
// The worker lazy-loads @huggingface/transformers and initializes the pipeline
// only once. Subsequent embed requests reuse the cached pipeline.
// ============================================================================

import type { WorkerRequest, WorkerResponse } from '../core/types.js';

// Type for the transformers pipeline (dynamic import)
type Pipeline = (texts: string[], options?: Record<string, unknown>) => Promise<{ tolist: () => number[][] }>;

let pipeline: Pipeline | null = null;

/**
 * Post a typed message to the main thread.
 */
function postTypedMessage(msg: WorkerResponse): void {
  self.postMessage(msg);
}

/**
 * Initialize the embedding pipeline.
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
 * Generate embeddings for a batch of texts.
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
 * Worker message handler.
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
