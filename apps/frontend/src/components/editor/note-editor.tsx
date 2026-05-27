import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import {
  Bold,
  Code,
  Highlighter,
  Italic,
  Link2,
  Plus,
  Strikethrough,
  Underline as UnderlineIcon,
} from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { SlashCommands } from "./slash-commands";

const lowlight = createLowlight(common);

interface NoteEditorProps {
  value: string;
  onChange: (html: string) => void;
  onSave?: () => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
}

export function NoteEditor({
  value,
  onChange,
  onSave,
  placeholder = "Nhập / để mở menu lệnh…",
  className,
  editable = true,
}: NoteEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading"
            ? `Tiêu đề ${node.attrs.level}`
            : placeholder,
        includeChildren: true,
        emptyEditorClass: "tiptap-placeholder",
        emptyNodeClass: "tiptap-placeholder",
      }),
      Typography,
      TaskList,
      TaskItem.configure({ nested: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: false }),
      Image.configure({ inline: false, allowBase64: true }),
      CodeBlockLowlight.configure({ lowlight }),
      SlashCommands,
    ],
    editorProps: {
      attributes: {
        class: "prose-app editor-canvas focus:outline-none min-h-[60vh]",
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "s") {
          event.preventDefault();
          onSave?.();
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const file = event.clipboardData?.files?.[0];
        if (file && file.type.startsWith("image/")) {
          event.preventDefault();
          void readAsDataURL(file).then((src) => {
            const imageNode = view.state.schema.nodes.image?.create({ src });
            if (!imageNode) return;
            view.dispatch(view.state.tr.replaceSelectionWith(imageNode));
          });
          return true;
        }
        return false;
      },
      handleDrop: (view, event) => {
        const file = event.dataTransfer?.files?.[0];
        if (!file || !file.type.startsWith("image/")) return false;
        event.preventDefault();
        void readAsDataURL(file).then((src) => {
          const pos = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          if (!pos) return;
          const imageNode = view.state.schema.nodes.image?.create({ src });
          if (!imageNode) return;
          view.dispatch(view.state.tr.insert(pos.pos, imageNode));
        });
        return true;
      },
    },
    content: value,
    editable,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return null;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin",
        className,
      )}
    >
      <BubbleMenu
        editor={editor}
        options={{ placement: "top" }}
        className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-pop"
      >
        <BubbleBtn editor={editor} mark="bold" title="Đậm">
          <Bold className="h-3.5 w-3.5" />
        </BubbleBtn>
        <BubbleBtn editor={editor} mark="italic" title="Nghiêng">
          <Italic className="h-3.5 w-3.5" />
        </BubbleBtn>
        <BubbleBtn editor={editor} mark="underline" title="Gạch chân">
          <UnderlineIcon className="h-3.5 w-3.5" />
        </BubbleBtn>
        <BubbleBtn editor={editor} mark="strike" title="Gạch ngang">
          <Strikethrough className="h-3.5 w-3.5" />
        </BubbleBtn>
        <BubbleBtn editor={editor} mark="code" title="Code">
          <Code className="h-3.5 w-3.5" />
        </BubbleBtn>
        <BubbleBtn editor={editor} mark="highlight" title="Highlight">
          <Highlighter className="h-3.5 w-3.5" />
        </BubbleBtn>
        <button
          type="button"
          onClick={() => {
            const prev = editor.getAttributes("link").href as string | undefined;
            const url = window.prompt("URL link", prev ?? "https://");
            if (url === null) return;
            if (url === "") {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              return;
            }
            editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href: url })
              .run();
          }}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
            editor.isActive("link") && "bg-accent text-accent-foreground",
          )}
          title="Link"
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
      </BubbleMenu>

      <FloatingMenu
        editor={editor}
        options={{ placement: "left" }}
        shouldShow={({ state }) => {
          const { $from } = state.selection;
          const node = $from.parent;
          return node.type.name === "paragraph" && node.content.size === 0;
        }}
      >
        <button
          type="button"
          onClick={() => {
            editor.chain().focus().insertContent("/").run();
          }}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-soft hover:text-foreground"
          title="Thêm block (/)"
          aria-label="Thêm block"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </FloatingMenu>

      <EditorContent editor={editor} />
    </div>
  );
}

type BubbleMark =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "code"
  | "highlight";

function BubbleBtn({
  editor,
  mark,
  title,
  children,
}: {
  editor: Editor;
  mark: BubbleMark;
  title: string;
  children: ReactNode;
}) {
  const active = editor.isActive(mark);
  return (
    <button
      type="button"
      onClick={() => {
        const chain = editor.chain().focus();
        switch (mark) {
          case "bold":
            chain.toggleBold().run();
            break;
          case "italic":
            chain.toggleItalic().run();
            break;
          case "underline":
            chain.toggleUnderline().run();
            break;
          case "strike":
            chain.toggleStrike().run();
            break;
          case "code":
            chain.toggleCode().run();
            break;
          case "highlight":
            chain.toggleHighlight().run();
            break;
        }
      }}
      title={title}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
        active && "bg-accent text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read error"));
    reader.readAsDataURL(file);
  });
}
