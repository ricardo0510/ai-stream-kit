// ============================================================================
// Tests: SSE Parser
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { SSEParser } from '../../src/core/sse-parser.js';
import type { SSEEvent } from '../../src/core/types.js';

/**
 * Helper: collect all events from parsing a string.
 */
function parse(input: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const parser = new SSEParser((event) => events.push(event));
  parser.feed(input);
  return events;
}

describe('SSEParser', () => {
  // =========================================================================
  // Basic Parsing
  // =========================================================================
  describe('basic event parsing', () => {
    it('should parse a simple data event', () => {
      const events = parse('data: hello\n\n');
      expect(events).toHaveLength(1);
      expect(events[0]!.data).toBe('hello');
    });

    it('should parse data without space after colon', () => {
      const events = parse('data:hello\n\n');
      expect(events).toHaveLength(1);
      expect(events[0]!.data).toBe('hello');
    });

    it('should parse event with multiple fields', () => {
      const events = parse('id: 42\nevent: update\ndata: {"text":"你好"}\n\n');
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        id: '42',
        event: 'update',
        data: '{"text":"你好"}',
      });
    });

    it('should parse multiple events', () => {
      const events = parse('data: first\n\ndata: second\n\n');
      expect(events).toHaveLength(2);
      expect(events[0]!.data).toBe('first');
      expect(events[1]!.data).toBe('second');
    });

    it('should handle multi-line data', () => {
      const events = parse('data: line1\ndata: line2\ndata: line3\n\n');
      expect(events).toHaveLength(1);
      expect(events[0]!.data).toBe('line1\nline2\nline3');
    });

    it('should handle empty data lines', () => {
      const events = parse('data:\n\n');
      expect(events).toHaveLength(1);
      expect(events[0]!.data).toBe('');
    });

    it('should handle data with only field name (no colon)', () => {
      const events = parse('data\n\n');
      expect(events).toHaveLength(1);
      expect(events[0]!.data).toBe('');
    });
  });

  // =========================================================================
  // Comments
  // =========================================================================
  describe('comments', () => {
    it('should ignore comment lines', () => {
      const events = parse(': this is a comment\ndata: ok\n\n');
      expect(events).toHaveLength(1);
      expect(events[0]!.data).toBe('ok');
    });

    it('should ignore empty comments', () => {
      const events = parse(':\ndata: ok\n\n');
      expect(events).toHaveLength(1);
      expect(events[0]!.data).toBe('ok');
    });

    it('should ignore comment-only blocks', () => {
      const events = parse(': comment\n\ndata: ok\n\n');
      expect(events).toHaveLength(1);
      expect(events[0]!.data).toBe('ok');
    });
  });

  // =========================================================================
  // Event ID
  // =========================================================================
  describe('event ID', () => {
    it('should track event ID', () => {
      const events = parse('id: 1\ndata: first\n\n');
      expect(events[0]!.id).toBe('1');
    });

    it('should persist last event ID across events', () => {
      const events = parse('id: 1\ndata: first\n\ndata: second\n\n');
      expect(events[0]!.id).toBe('1');
      expect(events[1]!.id).toBe('1'); // Persisted from first event
    });

    it('should update event ID', () => {
      const events = parse('id: 1\ndata: first\n\nid: 2\ndata: second\n\n');
      expect(events[0]!.id).toBe('1');
      expect(events[1]!.id).toBe('2');
    });

    it('should expose lastEventId on parser', () => {
      const parser = new SSEParser(() => {});
      parser.feed('id: abc\ndata: test\n\n');
      expect(parser.lastEventId).toBe('abc');
    });

    it('should ignore id with null character', () => {
      const events = parse('id: bad\0id\ndata: test\n\n');
      expect(events[0]!.id).toBeUndefined();
    });
  });

  // =========================================================================
  // Event Type
  // =========================================================================
  describe('event type', () => {
    it('should parse event type', () => {
      const events = parse('event: custom\ndata: test\n\n');
      expect(events[0]!.event).toBe('custom');
    });

    it('should not include event type when not specified', () => {
      const events = parse('data: test\n\n');
      expect(events[0]!.event).toBeUndefined();
    });
  });

  // =========================================================================
  // Retry
  // =========================================================================
  describe('retry field', () => {
    it('should parse retry as number', () => {
      const events = parse('retry: 3000\ndata: test\n\n');
      expect(events[0]!.retry).toBe(3000);
    });

    it('should ignore non-numeric retry', () => {
      const events = parse('retry: abc\ndata: test\n\n');
      expect(events[0]!.retry).toBeUndefined();
    });

    it('should ignore retry with mixed content', () => {
      const events = parse('retry: 123abc\ndata: test\n\n');
      expect(events[0]!.retry).toBeUndefined();
    });
  });

  // =========================================================================
  // Incremental Parsing (TCP Fragmentation)
  // =========================================================================
  describe('incremental parsing', () => {
    it('should handle split across data value', () => {
      const events: SSEEvent[] = [];
      const parser = new SSEParser((e) => events.push(e));

      parser.feed('data: hel');
      expect(events).toHaveLength(0);

      parser.feed('lo\n\n');
      expect(events).toHaveLength(1);
      expect(events[0]!.data).toBe('hello');
    });

    it('should handle split at line boundary', () => {
      const events: SSEEvent[] = [];
      const parser = new SSEParser((e) => events.push(e));

      parser.feed('data: hello\n');
      expect(events).toHaveLength(0);

      parser.feed('\n');
      expect(events).toHaveLength(1);
      expect(events[0]!.data).toBe('hello');
    });

    it('should handle byte-by-byte feeding', () => {
      const events: SSEEvent[] = [];
      const parser = new SSEParser((e) => events.push(e));

      const input = 'data: hi\n\n';
      for (const char of input) {
        parser.feed(char);
      }

      expect(events).toHaveLength(1);
      expect(events[0]!.data).toBe('hi');
    });

    it('should handle split in the middle of field name', () => {
      const events: SSEEvent[] = [];
      const parser = new SSEParser((e) => events.push(e));

      parser.feed('da');
      parser.feed('ta: test\n\n');

      expect(events).toHaveLength(1);
      expect(events[0]!.data).toBe('test');
    });

    it('should handle multiple events across feeds', () => {
      const events: SSEEvent[] = [];
      const parser = new SSEParser((e) => events.push(e));

      parser.feed('data: one\n\ndata: tw');
      expect(events).toHaveLength(1);

      parser.feed('o\n\n');
      expect(events).toHaveLength(2);
      expect(events[1]!.data).toBe('two');
    });
  });

  // =========================================================================
  // Line Endings
  // =========================================================================
  describe('line endings', () => {
    it('should handle \\r\\n line endings', () => {
      const events = parse('data: hello\r\n\r\n');
      expect(events).toHaveLength(1);
      expect(events[0]!.data).toBe('hello');
    });

    it('should handle \\r line endings', () => {
      const events: SSEEvent[] = [];
      const parser = new SSEParser((e) => events.push(e));
      parser.feed('data: hello\r\r');
      parser.feedEnd();
      expect(events).toHaveLength(1);
      expect(events[0]!.data).toBe('hello');
    });

    it('should handle mixed line endings', () => {
      const events = parse('data: hello\r\ndata: world\n\n');
      expect(events).toHaveLength(1);
      expect(events[0]!.data).toBe('hello\nworld');
    });
  });

  // =========================================================================
  // BOM Handling
  // =========================================================================
  describe('BOM handling', () => {
    it('should strip BOM from first chunk', () => {
      const events = parse('\uFEFFdata: hello\n\n');
      expect(events).toHaveLength(1);
      expect(events[0]!.data).toBe('hello');
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================
  describe('edge cases', () => {
    it('should ignore unknown fields', () => {
      const events = parse('foo: bar\ndata: test\n\n');
      expect(events).toHaveLength(1);
      expect(events[0]!.data).toBe('test');
    });

    it('should handle empty input', () => {
      const events = parse('');
      expect(events).toHaveLength(0);
    });

    it('should handle consecutive empty lines', () => {
      const events = parse('\n\n\ndata: test\n\n');
      expect(events).toHaveLength(1);
      expect(events[0]!.data).toBe('test');
    });

    it('should reset parser state', () => {
      const events: SSEEvent[] = [];
      const parser = new SSEParser((e) => events.push(e));

      parser.feed('data: first\n\n');
      expect(events).toHaveLength(1);

      parser.reset();
      expect(parser.lastEventId).toBeUndefined();

      parser.feed('data: second\n\n');
      expect(events).toHaveLength(2);
      expect(events[1]!.data).toBe('second');
    });

    it('should handle JSON data correctly', () => {
      const events = parse('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n');
      expect(events).toHaveLength(1);
      const parsed = JSON.parse(events[0]!.data);
      expect(parsed.choices[0].delta.content).toBe('你好');
    });
  });
});
