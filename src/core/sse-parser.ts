// ============================================================================
// AI-Stream-Kit — SSE Protocol Parser (State Machine)
// ============================================================================
// Implements the W3C Server-Sent Events parsing algorithm:
// https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
//
// Key design:
// - Incremental parsing: handles TCP packet fragmentation gracefully
// - Internal buffer accumulates incomplete lines across feed() calls
// - Strictly follows spec for field parsing, BOM handling, and dispatch
// ============================================================================

import type { SSEEvent } from './types.js';

/**
 * Callback invoked when a complete SSE event is parsed.
 */
export type SSEEventCallback = (event: SSEEvent) => void;

/**
 * Incremental SSE stream parser based on a state machine.
 *
 * Usage:
 * ```ts
 * const parser = new SSEParser((event) => console.log(event));
 * parser.feed('data: hello\n\n');
 * parser.feed('data: world\n');
 * parser.feed('\n');
 * ```
 */
export class SSEParser {
  /** Internal buffer for incomplete data across feed() calls */
  private buffer: string = '';

  /** Current event being accumulated before dispatch */
  private currentData: string[] = [];
  private currentId: string | undefined = undefined;
  private currentEvent: string | undefined = undefined;
  private currentRetry: number | undefined = undefined;

  /** The last seen event ID (persisted across events for reconnection) */
  private _lastEventId: string | undefined = undefined;

  /** Whether BOM has been stripped from the first chunk */
  private bomStripped: boolean = false;

  /** Whether the buffer previously ended with a \r (pending \r\n check) */
  private trailingCR: boolean = false;

  /** Callback to invoke for each complete event */
  private readonly onEvent: SSEEventCallback;

  constructor(onEvent: SSEEventCallback) {
    this.onEvent = onEvent;
  }

  /**
   * The last event ID received, used for `Last-Event-ID` header on reconnect.
   */
  get lastEventId(): string | undefined {
    return this._lastEventId;
  }

  /**
   * Feed a chunk of data into the parser.
   * Handles partial lines from TCP fragmentation.
   */
  feed(chunk: string): void {
    // Strip BOM from the very first chunk
    if (!this.bomStripped) {
      if (chunk.charCodeAt(0) === 0xfeff) {
        chunk = chunk.slice(1);
      }
      this.bomStripped = true;
    }

    // If buffer ends with \r and new chunk doesn't start with \n,
    // treat the trailing \r as a standalone line ending first
    if (
      this.trailingCR &&
      chunk.length > 0 &&
      chunk[0] !== '\n'
    ) {
      this.buffer += '\n'; // Convert pending \r to \n for processing
      this.trailingCR = false;
    } else if (this.trailingCR && chunk.length > 0 && chunk[0] === '\n') {
      // The \r was part of \r\n — remove trailing \r, chunk starts with \n
      this.trailingCR = false;
    }

    this.buffer += chunk;
    this.processBuffer();

    // Check if buffer ends with a lone \r — defer it
    if (this.buffer.endsWith('\r')) {
      this.buffer = this.buffer.slice(0, -1);
      this.trailingCR = true;
    }
  }

  /**
   * Signal that no more data will be fed.
   * Flushes any pending \r line ending.
   */
  feedEnd(): void {
    if (this.trailingCR) {
      this.buffer += '\n';
      this.trailingCR = false;
      this.processBuffer();
    }
  }

  /**
   * Reset the parser to its initial state.
   */
  reset(): void {
    this.buffer = '';
    this.currentData = [];
    this.currentId = undefined;
    this.currentEvent = undefined;
    this.currentRetry = undefined;
    this._lastEventId = undefined;
    this.bomStripped = false;
    this.trailingCR = false;
  }

  /**
   * Process the internal buffer, extracting and handling complete lines.
   * Lines are delimited by \r\n, \r, or \n (per SSE spec).
   */
  private processBuffer(): void {
    // Process line by line. We need to handle \r\n, \r, and \n.
    while (true) {
      const lineEnd = this.findLineEnd();
      if (lineEnd === -1) {
        // No complete line yet — wait for more data
        break;
      }

      const { index, length } = lineEnd;
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + length);

      this.processLine(line);
    }
  }

  /**
   * Find the next line ending in the buffer.
   * Returns the index and length of the line ending, or -1 if no complete line.
   */
  private findLineEnd(): { index: number; length: number } | -1 {
    // Since feed() handles \r by deferring or converting to \n,
    // the buffer should only contain \n and \r\n line endings.
    for (let i = 0; i < this.buffer.length; i++) {
      const char = this.buffer[i];
      if (char === '\r') {
        // Check for \r\n
        if (i + 1 < this.buffer.length && this.buffer[i + 1] === '\n') {
          return { index: i, length: 2 };
        }
        // Standalone \r (should be rare after feed() processing)
        return { index: i, length: 1 };
      }
      if (char === '\n') {
        return { index: i, length: 1 };
      }
    }
    return -1;
  }

  /**
   * Process a single complete line per the SSE spec.
   */
  private processLine(line: string): void {
    // Empty line = dispatch event
    if (line === '') {
      this.dispatchEvent();
      return;
    }

    // Comment line (starts with ':')
    if (line.startsWith(':')) {
      return;
    }

    // Parse field name and value
    const colonIndex = line.indexOf(':');

    let field: string;
    let value: string;

    if (colonIndex === -1) {
      // No colon — the entire line is the field name, value is empty
      field = line;
      value = '';
    } else {
      field = line.slice(0, colonIndex);
      // Remove single leading space from value if present (per spec)
      value = line.slice(colonIndex + 1);
      if (value.startsWith(' ')) {
        value = value.slice(1);
      }
    }

    this.processField(field, value);
  }

  /**
   * Handle a parsed field according to the SSE spec.
   */
  private processField(field: string, value: string): void {
    switch (field) {
      case 'data':
        this.currentData.push(value);
        break;

      case 'id':
        // Per spec: if value contains null character, ignore
        if (!value.includes('\0')) {
          this.currentId = value;
        }
        break;

      case 'event':
        this.currentEvent = value;
        break;

      case 'retry':
        // Per spec: if value consists solely of ASCII digits, set retry
        if (/^\d+$/.test(value)) {
          this.currentRetry = parseInt(value, 10);
        }
        break;

      default:
        // Unknown field — ignore per spec
        break;
    }
  }

  /**
   * Dispatch the accumulated event to the callback.
   * Called when an empty line is encountered.
   */
  private dispatchEvent(): void {
    // If no data was accumulated, reset and don't dispatch
    if (this.currentData.length === 0 && !this.currentEvent) {
      this.resetCurrentEvent();
      return;
    }

    // Update last event ID (persists across events)
    if (this.currentId !== undefined) {
      this._lastEventId = this.currentId;
    }

    const event: SSEEvent = {
      data: this.currentData.join('\n'),
    };

    if (this._lastEventId !== undefined) {
      event.id = this._lastEventId;
    }

    if (this.currentEvent !== undefined) {
      event.event = this.currentEvent;
    }

    if (this.currentRetry !== undefined) {
      event.retry = this.currentRetry;
    }

    this.onEvent(event);
    this.resetCurrentEvent();
  }

  /**
   * Reset current event state after dispatch.
   */
  private resetCurrentEvent(): void {
    this.currentData = [];
    this.currentId = undefined;
    this.currentEvent = undefined;
    this.currentRetry = undefined;
  }
}
