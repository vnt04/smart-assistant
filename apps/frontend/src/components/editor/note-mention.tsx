import {
  Node,
  ReactRenderer,
  mergeAttributes,
  type Editor,
} from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type ForwardedRef,
} from "react";
import { FileText } from "lucide-react";
import { cn } from "../../lib/cn";

export interface NoteRef {
  id: string;
  title: string;
}

export interface NoteMentionOptions {
  /** Tìm ghi chú theo tiêu đề cho dropdown gợi ý khi gõ `@`. */
  search: (query: string) => Promise<NoteRef[]>;
  /** Mở ghi chú đích khi người dùng bấm vào chip mention. */
  onOpen: (id: string) => void;
  HTMLAttributes: Record<string, unknown>;
}

const MENTION_LABEL_FALLBACK = "ghi chú";

// PluginKey RIÊNG cho mention. Bắt buộc: `@tiptap/suggestion` mặc định dùng chung
// một PluginKey "suggestion" ở module-level; slash-commands cũng dùng mặc định đó,
// nên nếu không tách key, ProseMirror sẽ ném "Adding different instances of a keyed
// plugin (suggestion$)" và làm sập editor ngay khi khởi tạo.
const NOTE_MENTION_PLUGIN_KEY = new PluginKey("noteMention");

/**
 * Node inline (atom) biểu diễn một liên kết tới ghi chú khác. Serialize thành
 *   <span data-note-mention data-note-id="<uuid>" data-label="<tiêu đề>">@Tiêu đề</span>
 * để backend bóc `data-note-id` dựng bảng liên kết/backlinks. Dùng `@tiptap/
 * suggestion` (đã có sẵn cho slash-commands) nên không thêm dependency mới.
 */
export const NoteMention = Node.create<NoteMentionOptions>({
  name: "noteMention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      search: async () => [],
      onOpen: () => {},
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-note-id"),
        renderHTML: (attrs) =>
          attrs.id ? { "data-note-id": attrs.id as string } : {},
      },
      label: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-label"),
        renderHTML: (attrs) =>
          attrs.label ? { "data-label": attrs.label as string } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-note-mention]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(
        { "data-note-mention": "", class: "note-mention" },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
      `@${node.attrs.label ?? MENTION_LABEL_FALLBACK}`,
    ];
  },

  renderText({ node }) {
    return `@${node.attrs.label ?? ""}`;
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span");
      dom.className = "note-mention";
      dom.setAttribute("data-note-mention", "");
      const id = node.attrs.id as string | null;
      const label = node.attrs.label as string | null;
      if (id) dom.setAttribute("data-note-id", id);
      if (label) dom.setAttribute("data-label", label);
      dom.textContent = `@${label ?? MENTION_LABEL_FALLBACK}`;

      const open = (event: Event): void => {
        if (!id) return;
        // Chặn ProseMirror đặt con trỏ / chọn node — bấm chip là điều hướng.
        event.preventDefault();
        event.stopPropagation();
        this.options.onOpen(id);
      };
      dom.addEventListener("mousedown", open);

      return {
        dom,
        destroy: () => dom.removeEventListener("mousedown", open),
      };
    };
  },

  addProseMirrorPlugins() {
    const type = this.name;
    return [
      Suggestion<NoteRef>({
        editor: this.editor,
        pluginKey: NOTE_MENTION_PLUGIN_KEY,
        char: "@",
        allowSpaces: false,
        startOfLine: false,
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type, attrs: { id: props.id, label: props.title } },
              { type: "text", text: " " },
            ])
            .run();
        },
        items: ({ query }) => this.options.search(query).catch(() => []),
        render: renderMentionDropdown,
      }),
    ];
  },
});

/* -------------------- Dropdown gợi ý -------------------- */

interface MentionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface MentionListProps {
  items: NoteRef[];
  command: (item: NoteRef) => void;
}

const MentionListInner = (
  { items, command }: MentionListProps,
  ref: ForwardedRef<MentionListHandle>,
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
        Không tìm thấy ghi chú
      </div>
    );
  }

  return (
    <div className="w-72 overflow-hidden rounded-lg border border-border bg-popover shadow-pop">
      <div className="max-h-72 overflow-y-auto scrollbar-thin p-1">
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => command(item)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
              i === index ? "bg-accent text-accent-foreground" : "hover:bg-muted",
            )}
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate font-medium leading-tight">
              {item.title || "Chưa có tiêu đề"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

const MentionList = forwardRef<MentionListHandle, MentionListProps>(
  MentionListInner,
);
MentionList.displayName = "MentionList";

function renderMentionDropdown() {
  let component: ReactRenderer<MentionListHandle, MentionListProps>;
  let popup: TippyInstance | null = null;

  return {
    onStart: (props: { editor: Editor; clientRect?: (() => DOMRect | null) | null }) => {
      component = new ReactRenderer(MentionList, {
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
    onUpdate: (props: { clientRect?: (() => DOMRect | null) | null }) => {
      component?.updateProps(props);
      const rect = props.clientRect?.();
      if (rect && popup) {
        popup.setProps({ getReferenceClientRect: () => rect });
      }
    },
    onKeyDown: (props: { event: KeyboardEvent }) => {
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
}
