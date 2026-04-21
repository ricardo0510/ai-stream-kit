// ============================================================================
// AI-Stream-Kit — SSE 传输协议解析器 (SSE Protocol Parser)
// ============================================================================
// 负责实现基于 W3C 草案中关于 Server-Sent Events 事件流解释的相关标准算法：
// https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
//
// 核心架构逻辑：
// - 基于增量式解析策略：能平滑妥帖地处理由于 TCP 分包带来的消息截断现象
// - 使用滞留缓冲区积累拼接通过 feed() 方法送进去的一段段不规整的数据源
// - 对于 BOM 标头、跨平台换行符拆分、字段格式提取采取极其严格的容错与剔除操作
// ============================================================================

import type { SSEEvent } from './types.js';

/**
 * 当单独且完整的 SSE 事件成功拼接解析出来时，调用的触发回调的类型定义。
 */
export type SSEEventCallback = (event: SSEEvent) => void;

/**
 * 以有限状态机概念编写的增量式 SSE 二进制/字符串流接收处理解析器。
 *
 * 用法范例:
 * ```ts
 * const parser = new SSEParser((event) => console.log(event));
 * parser.feed('data: hello\n\n');
 * parser.feed('data: world\n');
 * parser.feed('\n');
 * ```
 */
export class SSEParser {
  /** 用于存放因被阶段而等待跟后续 feed() 相结合并进行拼接缝合的字符缓冲区 */
  private buffer: string = '';

  /** 存放目前正在发酵并有待组合输出的这一个单件 Event 属性成员池子 */
  private currentData: string[] = [];
  private currentId: string | undefined = undefined;
  private currentEvent: string | undefined = undefined;
  private currentRetry: number | undefined = undefined;

  /** 保留所见过的最新的一条事件 ID（此 ID 常态驻留以用在网络断连时恢复定位使用） */
  private _lastEventId: string | undefined = undefined;

  /** 决定是否已经在第一块进来的数据里头砍掉了 BOM 前缀标识 (Zero Width No-Break Space) */
  private bomStripped: boolean = false;

  /** 标记前一个缓冲区残片结尾是否悬空着一个 \r 字符 (用来预测 \r\n 连体情况) */
  private trailingCR: boolean = false;

  /** 最终将成果转手导出的接收回调函式体 */
  private readonly onEvent: SSEEventCallback;

  constructor(onEvent: SSEEventCallback) {
    this.onEvent = onEvent;
  }

  /**
   * 被登记保存的最后的一笔事件 ID (也就是 `Last-Event-ID` 向后端声明的断点游标)。
   */
  get lastEventId(): string | undefined {
    return this._lastEventId;
  }

  /**
   * 将碎渣一样的数据小碎块灌注投喂给这段机制解析器。
   * 这里自带一套对付由于 TCP 发包分错位置导致片段截断的精巧处理逻辑。
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
   * 给解析器下发一份终止停喂通知信号。
   * 该机制能够把滞存在缓存尾部的孤独悬空 \r 行符号变现为最后收口的阶段分批指令。
   */
  feedEnd(): void {
    if (this.trailingCR) {
      this.buffer += '\n';
      this.trailingCR = false;
      this.processBuffer();
    }
  }

  /**
   * 把这套状态机大重置洗刷至最初形态去迎接新的一波访问。
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
   * 在当前装配的缓存字符串块中，尽最大搜素挖掘提取出合法完整行，并层层往下送出执行命令。
   * 依 SSE 标规：将独立出现的 \r\n、\r、亦或是 \n 都能同等地判定成一条完美的分隔终结横线。
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
   * 去查找位于当前寄存区内的第一处分行标志节点。
   * 会同时带回包含标志符游标以及该标志符号所占篇幅长度的信息包。
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
   * 对依据拆出来的单独纯文本行执行对应的协议规则拆包及组装操作。
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
   * 根据标准的 Server-Sent Events 文件流结构，按照其命名给其对应值安排到缓存坑位之中。
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
   * 对将就完组装了的参数库集合发起派遣调用命令抛至用户方。
   * 该逻辑多是在读取中遇到光秃秃毫无内容的一条空白行而点燃发条的。
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
   * 倾销一切单向组件的暂时遗留历史存活记录。
   */
  private resetCurrentEvent(): void {
    this.currentData = [];
    this.currentId = undefined;
    this.currentEvent = undefined;
    this.currentRetry = undefined;
  }
}
