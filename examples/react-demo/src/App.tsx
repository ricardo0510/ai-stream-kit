import { useEffect, useRef, useState } from "react";
import { StreamMarkdownRenderer } from "ai-stream-kit";
import { marked } from "marked";
import "./App.css";

const DEMO_MARKDOWN = `
# AI-Stream-Kit 渲染测试

你好！我是从这段打字机效果流输出的测试字符。下面我会给你展示一段**带有格式**的 Markdown！

让我们看看如果不做标签自动闭环，代码块会在打字期间破相成什么样，由于有了 \`autoClose\`：

\`\`\`javascript
function helloWorld() {
  console.log("Hello, AI-Stream-Kit! 😎");
  return true;
}
\`\`\`

还有复杂的嵌套内容：
- **粗体**，*斜体* 以及 ~~删除线~~
- [这是 GitHub 链接](https://github.com)

🚀 完毕！非常顺滑！
`;

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const rendererRef = useRef<StreamMarkdownRenderer | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    rendererRef.current = new StreamMarkdownRenderer({
      markdownToHtml: (md: string) => marked.parse(md) as string,
      container: containerRef.current!,
      autoScroll: true,
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const startStream = () => {
    if (isPlaying) return;
    rendererRef.current?.reset();
    setIsPlaying(true);

    let index = 0;

    intervalRef.current = window.setInterval(() => {
      const chunkSize = Math.floor(Math.random() * 3) + 1;
      const chunk = DEMO_MARKDOWN.slice(index, index + chunkSize);

      rendererRef.current?.append(chunk);
      index += chunkSize;

      if (index >= DEMO_MARKDOWN.length) {
        clearInterval(intervalRef.current!);
        setIsPlaying(false);
      }
    }, 40);
  };

  return (
    <div className="app-container">
      <button className="action-btn" onClick={startStream} disabled={isPlaying}>
        {isPlaying ? "⚡ 正在高并发输出中..." : "▶ 点击开始测试模拟推流"}
      </button>

      <div className={`terminal-window ${isPlaying ? "streaming-active" : ""}`}>
        <div className="terminal-header">
          <div className="mac-buttons">
            <div className="mac-btn close"></div>
            <div className="mac-btn minimize"></div>
            <div className="mac-btn maximize"></div>
          </div>
          <div className="terminal-title">bash — testing_stream_sdk</div>
        </div>

        <div className="markdown-body">
          {/* 这里挂载 renderer 输出的 HTML */}
          <div ref={containerRef} style={{ display: "inline" }} />
          {isPlaying && <span className="cursor"></span>}
        </div>
      </div>
    </div>
  );
}

export default App;
