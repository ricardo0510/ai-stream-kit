// ============================================================================
// AI-Stream-Kit — Markdown 自动闭合标签算法 (Markdown Auto-Close Algorithm)
// ============================================================================
// 解决流式 AI 回答里最让人头疼的问题——正在输出的 Markdown 片段缺少闭合标签。
// （例如 AI 吐出 "```js\nconst a ="，渲染器就会因缺失反引号而导致页面样式炸裂）
//
// 此算法以高速逐字符扫描增量文本，在内存中维护了一套标签配对栈机制。
// 每一次调用，都会推算出那些没有尽头的无底洞标签们，并动态在句尾套上“防具”，
// 吐出一份随时且合法的新文本让你可以放肆交给 Markdown 解析器去吃。
//
// 实现难度标星: ★★★★
// ============================================================================

/**
 * 魔法函数：自动探测任意残缺代码片中的未完结标签，并赐予它们应有的体面（强行缝补截断区）。
 *
 * @param partial - 当下这一秒收集到的，还未发育成型的破碎 Markdown 原文
 * @returns 经过修补后缀闭合标志位的坚固 Markdown，再也不会引发页面解析故障了
 *
 * @example
 * ```ts
 * autoClose('**你好')        // => '**你好**'
 * autoClose('```js\nconst a') // => '```js\nconst a\n```'
 * autoClose('*粗体')          // => '*粗体*'
 * autoClose('平安信件')       // => '平安信件'
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
  /** 用以记载行内元素 (如加粗、斜体等) 的未闭合痕迹栈 (FILO 先进后出原则) */
  inlineStack: InlineMarker[];
  /** 判断是不是处于巨大的跨行代码块保护罩 (Code Block) 内部 */
  inCodeBlock: boolean;
  /** 将围起当前代码块的栅栏标志保存作罪证实录 (比如 "```" 或者 "````") */
  codeFence: string;
  /** 提示此刻是不是身处于单行行内的内嵌小代码框范围 */
  inInlineCode: boolean;
  /** 追踪链接和图片从方括号到圆括号的未走完的流浪历程 */
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
 * 校验指定的一行内容是不是代码域的分界护栏: 使用大量反引号 ``` 或是波浪号 ~~~。
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
 * 深度微观探查法 —— 把一整行拿来一个个字地剥开检查有没有内联的控制记号作祟。
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
 * 单元素双向开关推弹器。
 * 若新来的标识曾经登顶，代表凑够了一对，可将其带小弟一并清弹出栈外（视为闭合）。
 * 若为陌生新兵，则直接塞上栈顶充当挂件（等缘人救赎）。
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
 * 在受害者阵列里找到特定那个人物最后定格的历史索引位置。
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
 * 结算清理：收集整理全盘状态搜罗出一大段能够将原残缺文本救活的后缀尾修补材料。
 */
function generateSuffix(state: ScanState): string {
  let suffix = '';

  // 1. 先管好那些无家可归还没匹配结束的[文本](链接) 以及 ![图片](地址)
  if (state.linkState.type === 'text') {
    suffix += ']()';
  } else if (state.linkState.type === 'url') {
    suffix += ')';
  } else if (state.linkState.type === 'image_bang') {
    // Just a lone !, no action needed
  }

  // 2. 安抚没穿衣服的短行代码片 `
  if (state.inInlineCode) {
    suffix += '`';
  }

  // 3. 按照逆向思维把堆叠高挂的加粗斜体大杂烩按 FILO 弹射出来收尾
  for (let i = state.inlineStack.length - 1; i >= 0; i--) {
    suffix += state.inlineStack[i];
  }

  // 4. 重头戏 —— 盖上漏风严重的大代码库屋顶
  if (state.inCodeBlock) {
    suffix += '\n' + state.codeFence;
  }

  return suffix;
}
