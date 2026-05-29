import {
  Extension,
  ReactRenderer,
  type Editor,
  type Range,
} from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type ForwardedRef,
} from "react";
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListChecks,
  ListOrdered,
  type LucideIcon,
  Minus,
  Quote,
  Table as TableIcon,
  Type,
} from "lucide-react";
import { cn } from "../../lib/cn";

interface SlashItem {
  title: string;
  description: string;
  icon: LucideIcon;
  keywords: string[];
  command: (props: { editor: Editor; range: Range }) => void;
}

const ITEMS: SlashItem[] = [
  {
    title: "Văn bản",
    description: "Bắt đầu viết với văn bản thường",
    icon: Type,
    keywords: ["text", "paragraph", "p", "vanban"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: "Tiêu đề 1",
    description: "Tiêu đề lớn nhất",
    icon: Heading1,
    keywords: ["h1", "title", "heading"],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setHeading({ level: 1 })
        .run(),
  },
  {
    title: "Tiêu đề 2",
    description: "Tiêu đề trung bình",
    icon: Heading2,
    keywords: ["h2"],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setHeading({ level: 2 })
        .run(),
  },
  {
    title: "Tiêu đề 3",
    description: "Tiêu đề nhỏ",
    icon: Heading3,
    keywords: ["h3"],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setHeading({ level: 3 })
        .run(),
  },
  {
    title: "Danh sách",
    description: "Bullet list",
    icon: List,
    keywords: ["bullet", "ul", "list", "danhsach"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: "Danh sách số",
    description: "Numbered list",
    icon: ListOrdered,
    keywords: ["number", "ol", "ordered"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: "Checklist",
    description: "Task list với checkbox",
    icon: ListChecks,
    keywords: ["task", "todo", "check"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: "Trích dẫn",
    description: "Blockquote",
    icon: Quote,
    keywords: ["quote", "blockquote", "trichdan"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: "Code block",
    description: "Khối mã có syntax highlight",
    icon: Code2,
    keywords: ["code", "pre", "snippet"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "Bảng",
    description: "Chèn bảng 3×3 có hàng tiêu đề",
    icon: TableIcon,
    keywords: ["table", "bang", "grid", "row", "column", "cot", "hang"],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    title: "Đường kẻ",
    description: "Horizontal divider",
    icon: Minus,
    keywords: ["hr", "divider", "line", "ke"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: "Hình ảnh",
    description: "Chèn ảnh từ URL",
    icon: ImageIcon,
    keywords: ["image", "img", "photo", "hinh", "anh"],
    command: ({ editor, range }) => {
      const url = window.prompt("URL hình ảnh");
      if (!url) {
        editor.chain().focus().deleteRange(range).run();
        return;
      }
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setImage({ src: url })
        .run();
    },
  },
];

interface SlashListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface SlashListProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

const SlashListInner = (
  { items, command }: SlashListProps,
  ref: ForwardedRef<SlashListHandle>,
) => {
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setIndex((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        const selected = items[index];
        if (selected) command(selected);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) {
    return (
      <div className="rounded-lg border border-border bg-popover p-2 text-xs text-muted-foreground shadow-pop">
        Không có kết quả
      </div>
    );
  }

  return (
    <div className="w-72 overflow-hidden rounded-lg border border-border bg-popover shadow-pop">
      <div className="max-h-80 overflow-y-auto scrollbar-thin p-1">
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <button
              key={item.title}
              type="button"
              onClick={() => command(item)}
              className={cn(
                "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                i === index
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted",
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="font-medium leading-tight">{item.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {item.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const SlashList = forwardRef<SlashListHandle, SlashListProps>(SlashListInner);
SlashList.displayName = "SlashList";

export const SlashCommands = Extension.create({
  name: "slashCommands",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: Range;
          props: SlashItem;
        }) => props.command({ editor, range }),
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase();
          if (!q) return ITEMS.slice(0, 10);
          return ITEMS.filter(
            (item) =>
              item.title.toLowerCase().includes(q) ||
              item.keywords.some((k) => k.includes(q)),
          ).slice(0, 10);
        },
        render: () => {
          let component: ReactRenderer<SlashListHandle, SlashListProps>;
          let popup: TippyInstance | null = null;

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashList, {
                props,
                editor: props.editor,
              });
              const rect = props.clientRect?.();
              if (!rect) return;
              popup = tippy(document.body, {
                getReferenceClientRect: () => rect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
              });
            },
            onUpdate: (props) => {
              component?.updateProps(props);
              const rect = props.clientRect?.();
              if (rect && popup) {
                popup.setProps({ getReferenceClientRect: () => rect });
              }
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                popup?.hide();
                return true;
              }
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              popup?.destroy();
              component?.destroy();
            },
          };
        },
      }),
    ];
  },
});
