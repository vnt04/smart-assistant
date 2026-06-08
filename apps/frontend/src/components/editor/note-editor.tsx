import {
  useEditor,
  useEditorState,
  EditorContent,
  type Editor,
} from "@tiptap/react";
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
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { TextStyle, FontSize } from "@tiptap/extension-text-style";
import { common, createLowlight } from "lowlight";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  Code,
  Heading,
  Highlighter,
  Italic,
  Link2,
  Minus,
  Plus,
  Strikethrough,
  Trash2,
  Underline as UnderlineIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { SlashCommands } from "./slash-commands";
import { NoteMention, type NoteRef } from "./note-mention";
import { CodeBlock } from "./code-block";

const lowlight = createLowlight(common);

interface NoteEditorProps {
  value: string;
  onChange: (html: string) => void;
  onSave?: () => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
  /** Tìm ghi chú cho dropdown mention `@`. Không truyền ⇒ tắt mention. */
  searchNotes?: (query: string) => Promise<NoteRef[]>;
  /** Mở ghi chú đích khi bấm vào một mention trong nội dung. */
  onOpenNote?: (id: string) => void;
}

export function NoteEditor({
  value,
  onChange,
  onSave,
  placeholder = "Nhập / để mở menu lệnh…",
  className,
  editable = true,
  searchNotes,
  onOpenNote,
}: NoteEditorProps) {
  // Callback mention thay đổi theo note đang mở, nhưng mảng extensions chỉ dựng
  // một lần lúc khởi tạo editor — giữ qua ref để node luôn gọi bản mới nhất.
  const searchRef = useRef(searchNotes);
  const onOpenRef = useRef(onOpenNote);
  useEffect(() => {
    searchRef.current = searchNotes;
  }, [searchNotes]);
  useEffect(() => {
    onOpenRef.current = onOpenNote;
  }, [onOpenNote]);

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
      TextStyle,
      FontSize,
      TaskList,
      TaskItem.configure({ nested: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: false }),
      Image.configure({ inline: false, allowBase64: true }),
      CodeBlock.configure({ lowlight }),
      Table.configure({ resizable: true, allowTableNodeSelection: true }),
      TableRow,
      TableHeader,
      TableCell,
      SlashCommands,
      NoteMention.configure({
        search: (query) => searchRef.current?.(query) ?? Promise.resolve([]),
        onOpen: (id) => onOpenRef.current?.(id),
      }),
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
      {editable && <TableToolbar editor={editor} />}

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

        <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />

        <AlignButtons editor={editor} />

        <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />

        <FontSizeControl editor={editor} />

        <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />

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

/* -------------------- Text alignment -------------------- */

const ALIGN_OPTIONS = [
  { value: "left", title: "Căn trái", Icon: AlignLeft },
  { value: "center", title: "Căn giữa", Icon: AlignCenter },
  { value: "right", title: "Căn phải", Icon: AlignRight },
  { value: "justify", title: "Căn đều hai bên", Icon: AlignJustify },
] as const;

function AlignButtons({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor }) => {
      for (const { value } of ALIGN_OPTIONS) {
        if (editor.isActive({ textAlign: value })) return value;
      }
      return null;
    },
  });

  return (
    <>
      {ALIGN_OPTIONS.map(({ value, title, Icon }) => (
        <button
          key={value}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().setTextAlign(value).run()}
          title={title}
          aria-label={title}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
            active === value && "bg-accent text-accent-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </>
  );
}

/* -------------------- Font size -------------------- */

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 30] as const;
const DEFAULT_FONT_SIZE = 16;

function FontSizeControl({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = useEditorState({
    editor,
    selector: ({ editor }) => {
      const raw = editor.getAttributes("textStyle").fontSize as
        | string
        | undefined;
      const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
      return Number.isFinite(parsed) ? parsed : null;
    },
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const display = current ?? DEFAULT_FONT_SIZE;

  const apply = (size: number) => {
    const chain = editor.chain().focus();
    if (size === DEFAULT_FONT_SIZE) {
      chain.unsetFontSize().run();
    } else {
      chain.setFontSize(`${size}px`).run();
    }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
        title="Cỡ chữ"
        aria-label="Cỡ chữ"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-xs tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground",
          (open || current !== null) && "bg-accent text-accent-foreground",
        )}
      >
        {display}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-60 w-32 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-pop scrollbar-thin"
        >
          {FONT_SIZES.map((size) => {
            const selected =
              size === DEFAULT_FONT_SIZE ? current === null : current === size;
            return (
              <button
                key={size}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => apply(size)}
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-2 py-1 text-xs tabular-nums text-foreground hover:bg-muted",
                  selected && "bg-accent text-accent-foreground",
                )}
              >
                {size === DEFAULT_FONT_SIZE ? `${size} (mặc định)` : size}
                {selected && <Check className="h-3 w-3 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------- Table toolbar -------------------- */

function TableToolbar({ editor }: { editor: Editor }) {
  const isInTable = useEditorState({
    editor,
    selector: ({ editor }) => editor.isActive("table"),
  });

  if (!isInTable) return null;

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-border bg-background/95 px-4 py-1.5 backdrop-blur md:px-8">
      <TableGroup label="Cột">
        <TableBtn
          title="Thêm cột"
          onClick={() => editor.chain().focus().addColumnAfter().run()}
        >
          <Plus className="h-3.5 w-3.5" />
        </TableBtn>
        <TableBtn
          title="Xoá cột"
          onClick={() => editor.chain().focus().deleteColumn().run()}
        >
          <Minus className="h-3.5 w-3.5" />
        </TableBtn>
      </TableGroup>

      <span aria-hidden className="h-4 w-px bg-border" />

      <TableGroup label="Hàng">
        <TableBtn
          title="Thêm hàng"
          onClick={() => editor.chain().focus().addRowAfter().run()}
        >
          <Plus className="h-3.5 w-3.5" />
        </TableBtn>
        <TableBtn
          title="Xoá hàng"
          onClick={() => editor.chain().focus().deleteRow().run()}
        >
          <Minus className="h-3.5 w-3.5" />
        </TableBtn>
      </TableGroup>

      <span aria-hidden className="h-4 w-px bg-border" />

      <TableGroup label="Căn lề">
        <AlignButtons editor={editor} />
      </TableGroup>

      <span aria-hidden className="h-4 w-px bg-border" />

      <TableBtn
        title="Bật/tắt hàng tiêu đề"
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
      >
        <Heading className="h-3.5 w-3.5" />
      </TableBtn>

      <TableBtn
        title="Xoá bảng"
        destructive
        onClick={() => editor.chain().focus().deleteTable().run()}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </TableBtn>
    </div>
  );
}

function TableGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <span className="mr-0.5 text-2xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function TableBtn({
  title,
  onClick,
  destructive,
  children,
}: {
  title: string;
  onClick: () => void;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
        destructive && "hover:bg-destructive/10 hover:text-destructive",
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
