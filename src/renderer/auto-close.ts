// ============================================================================
// AI-Stream-Kit — Markdown Auto-Close Algorithm
// ============================================================================
// Solves the streaming Markdown rendering problem: when AI outputs partial
// Markdown (e.g., "```js\nconst a ="), parsers can't render it correctly
// because tags are unclosed.
//
// This algorithm scans the accumulated text, maintains a tag stack, and
// appends closing markers for any unclosed tags — producing valid Markdown
// that can be safely rendered at any point in the stream.
//
// Difficulty: ★★★★
// ============================================================================

/**
 * Automatically close unclosed Markdown tags in a partial stream.
 *
 * @param partial - The partially received Markdown text
 * @returns The input with necessary closing markers appended
 *
 * @example
 * ```ts
 * autoClose('**hello')        // => '**hello**'
 * autoClose('```js\nconst a') // => '```js\nconst a\n```'
 * autoClose('*italic text')   // => '*italic text*'
 * autoClose('normal text')    // => 'normal text'
 * ```
 */
export function autoClose(partial: string): string {
  const state = scan(partial);
  return partial + generateSuffix(state);
}

// ============================================================================
// Internal Types
// ============================================================================

interface ScanState {
  /** Stack of unclosed inline markers */
  inlineStack: InlineMarker[];
  /** Whether we're inside a code block */
  inCodeBlock: boolean;
  /** The opening fence of the current code block (e.g., "```" or "````") */
  codeFence: string;
  /** Whether we're inside an inline code span */
  inInlineCode: boolean;
  /** Unclosed link/image bracket tracking */
  linkState: LinkState;
}

type InlineMarker = '**' | '__' | '*' | '_' | '~~';

type LinkState =
  | { type: 'none' }
  | { type: 'image_bang' }       // just saw !
  | { type: 'text'; isImage: boolean }  // inside [...]
  | { type: 'url'; isImage: boolean };  // inside (...)

// ============================================================================
// Scanner
// ============================================================================

function scan(text: string): ScanState {
  const state: ScanState = {
    inlineStack: [],
    inCodeBlock: false,
    codeFence: '',
    inInlineCode: false,
    linkState: { type: 'none' },
  };

  const lines = text.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!;

    // Check for code fence lines (``` or ~~~, with possible language)
    if (!state.inInlineCode) {
      const fenceMatch = matchCodeFence(line);
      if (fenceMatch) {
        if (state.inCodeBlock) {
          // Check if this fence closes the current code block
          if (fenceMatch.fence.length >= state.codeFence.length &&
              fenceMatch.char === state.codeFence[0]) {
            state.inCodeBlock = false;
            state.codeFence = '';
          }
        } else {
          state.inCodeBlock = true;
          state.codeFence = fenceMatch.fence;
        }
        continue;
      }
    }

    // Inside code block — don't parse anything
    if (state.inCodeBlock) {
      continue;
    }

    // Parse inline content character by character
    scanInline(line, state);
  }

  return state;
}

/**
 * Match a code fence line: ``` or ~~~ (3+ chars), optionally followed by a language.
 */
function matchCodeFence(
  line: string
): { fence: string; char: string } | null {
  const trimmed = line.trimStart();
  const match = /^(`{3,}|~{3,})(.*)$/.exec(trimmed);
  if (!match) return null;

  const fence = match[1]!;
  const char = fence[0]!;
  const rest = match[2]!;

  // Opening fence: rest can contain info string (language) but no backticks for ` fences
  if (char === '`' && rest.includes('`')) {
    return null; // Not a valid fence
  }

  return { fence, char };
}

/**
 * Scan a single line for inline Markdown markers.
 */
function scanInline(line: string, state: ScanState): void {
  let i = 0;

  while (i < line.length) {
    const ch = line[i]!;

    // Handle escape sequences
    if (ch === '\\' && i + 1 < line.length) {
      i += 2; // Skip escaped character
      continue;
    }

    // ---- Inline code ----
    if (ch === '`') {
      if (state.inInlineCode) {
        state.inInlineCode = false;
        i++;
        continue;
      } else {
        // Don't open inline code if we detect a potential code fence start
        // (handled at line level)
        state.inInlineCode = true;
        i++;
        continue;
      }
    }

    // Inside inline code — skip all other processing
    if (state.inInlineCode) {
      i++;
      continue;
    }

    // ---- Link / Image tracking ----
    if (ch === '!' && i + 1 < line.length && line[i + 1] === '[') {
      state.linkState = { type: 'image_bang' };
      i++;
      continue;
    }

    if (ch === '[') {
      const isImage = state.linkState.type === 'image_bang';
      state.linkState = { type: 'text', isImage };
      i++;
      continue;
    }

    if (ch === ']' && (state.linkState.type === 'text')) {
      // Check for (
      if (i + 1 < line.length && line[i + 1] === '(') {
        state.linkState = { type: 'url', isImage: state.linkState.isImage };
        i += 2;
        continue;
      } else {
        // Not a link — reset
        state.linkState = { type: 'none' };
        i++;
        continue;
      }
    }

    if (ch === ')' && state.linkState.type === 'url') {
      // Link closed
      state.linkState = { type: 'none' };
      i++;
      continue;
    }

    // Reset image_bang state if next char isn't [
    if (state.linkState.type === 'image_bang' && ch !== '[') {
      state.linkState = { type: 'none' };
    }

    // ---- Strikethrough ~~ ----
    if (ch === '~' && i + 1 < line.length && line[i + 1] === '~') {
      toggleInline(state, '~~');
      i += 2;
      continue;
    }

    // ---- Bold ** or __ ----
    if (ch === '*' && i + 1 < line.length && line[i + 1] === '*') {
      toggleInline(state, '**');
      i += 2;
      continue;
    }

    if (ch === '_' && i + 1 < line.length && line[i + 1] === '_') {
      toggleInline(state, '__');
      i += 2;
      continue;
    }

    // ---- Italic * or _ ----
    if (ch === '*') {
      toggleInline(state, '*');
      i++;
      continue;
    }

    if (ch === '_') {
      toggleInline(state, '_');
      i++;
      continue;
    }

    i++;
  }
}

/**
 * Toggle an inline marker on the stack.
 * If the marker is already on top, pop it (closing).
 * Otherwise, push it (opening).
 */
function toggleInline(state: ScanState, marker: InlineMarker): void {
  const lastIndex = findLastIndex(state.inlineStack, marker);
  if (lastIndex !== -1) {
    // Close: remove marker and everything after it
    state.inlineStack.splice(lastIndex);
  } else {
    // Open: push onto stack
    state.inlineStack.push(marker);
  }
}

/**
 * Find the last occurrence of a marker in the stack.
 */
function findLastIndex(stack: InlineMarker[], marker: InlineMarker): number {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i] === marker) return i;
  }
  return -1;
}

// ============================================================================
// Suffix Generator
// ============================================================================

/**
 * Generate closing markers for all unclosed tags.
 */
function generateSuffix(state: ScanState): string {
  let suffix = '';

  // 1. Close unclosed link/image
  if (state.linkState.type === 'text') {
    suffix += ']()';
  } else if (state.linkState.type === 'url') {
    suffix += ')';
  } else if (state.linkState.type === 'image_bang') {
    // Just a lone !, no action needed
  }

  // 2. Close unclosed inline code
  if (state.inInlineCode) {
    suffix += '`';
  }

  // 3. Close inline markers in reverse order (stack LIFO)
  for (let i = state.inlineStack.length - 1; i >= 0; i--) {
    suffix += state.inlineStack[i];
  }

  // 4. Close unclosed code block
  if (state.inCodeBlock) {
    suffix += '\n' + state.codeFence;
  }

  return suffix;
}
