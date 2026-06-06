import { useState } from "react";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { Check, Copy } from "lucide-react";
import { cn } from "../../lib/cn";

const COPIED_RESET_MS = 1500;

/**
 * Hiển thị code block kiểu ChatGPT: thanh header có nhãn ngôn ngữ + nút chép.
 * Chỉ là NodeView (lớp render trong editor) — `renderHTML` mặc định của
 * CodeBlockLowlight vẫn serialize ra `<pre><code>` nên nội dung lưu xuống và
 * syntax highlight không đổi; header/nút không lọt vào HTML đã lưu.
 */
function CodeBlockView({ node }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const language = (node.attrs.language as string | null) || null;

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // Clipboard API cần secure context (https / localhost). Nếu bị chặn thì
      // bỏ qua êm thay vì làm vỡ editor.
    }
  };

  return (
    <NodeViewWrapper className="code-block-wrapper">
      <div className="code-block-header" contentEditable={false}>
        <span className="code-block-lang">{language ?? "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          onMouseDown={(event) => event.preventDefault()}
          className={cn("code-block-copy", copied && "is-copied")}
          title="Sao chép mã"
          aria-label="Sao chép mã"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Đã chép
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Chép
            </>
          )}
        </button>
      </div>
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

/**
 * CodeBlockLowlight + NodeView nút copy. Vẫn nhận `.configure({ lowlight })` như
 * extension gốc (note-editor truyền lowlight instance vào).
 */
export const CodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});
