import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { NoteSummary, Notebook, Tag } from "@assistant/shared";
import {
  ChevronRight,
  CopyMinus,
  FileText,
  FilePlus,
  FolderPlus,
  Lock,
  LockOpen,
  MoreHorizontal,
  Palette,
  Pencil,
  Pin,
  Plus,
  Search,
  Share2,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "../../lib/cn";
import {
  isNoteEffectivelyLocked,
  isNotebookEffectivelyLocked,
} from "../../lib/note-lock";
import { Input } from "../ui/input";
import { useConfirm } from "../ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export const NOTEBOOK_COLORS: ReadonlyArray<{ hex: string; label: string }> = [
  { hex: "#ef4444", label: "Đỏ" },
  { hex: "#f97316", label: "Cam" },
  { hex: "#eab308", label: "Vàng" },
  { hex: "#22c55e", label: "Xanh lá" },
  { hex: "#3b82f6", label: "Xanh dương" },
  { hex: "#a855f7", label: "Tím" },
  { hex: "#ec4899", label: "Hồng" },
  { hex: "#06b6d4", label: "Xanh ngọc" },
];

export interface NotesExplorerProps {
  notebooks: Notebook[];
  notes: NoteSummary[];
  selectedNoteId: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onSelectNote: (id: string) => void;
  onCreateNote: (notebookId: string | null) => Promise<void> | void;
  onDeleteNote: (id: string) => Promise<void> | void;
  onTogglePinNote: (note: NoteSummary) => Promise<void> | void;
  /** Move a note into a notebook (null = uncategorized / top level). */
  onMoveNote: (noteId: string, notebookId: string | null) => Promise<void> | void;
  onCreateNotebook: (input: {
    name: string;
    parentId: string | null;
  }) => Promise<void>;
  onRenameNotebook: (id: string, name: string) => Promise<void>;
  onColorNotebook: (id: string, color: string | null) => Promise<void>;
  onDeleteNotebook: (id: string) => Promise<void>;
  /** Re-parent a notebook (null = move to top level). */
  onMoveNotebook: (id: string, parentId: string | null) => Promise<void>;
  tags: Tag[];
  activeTag: string | null;
  onTagChange: (tag: string | null) => void;
  isLoading?: boolean;
  /** Notebook tra cứu theo id — để tính khóa hiệu lực (cascade) cho từng dòng. */
  notebooksById: Map<string, Notebook>;
  onLockNotebook: (id: string) => void;
  onUnlockNotebook: (id: string) => void;
  onShareNotebook: (id: string) => void;
}

interface FolderNode {
  notebook: Notebook;
  children: FolderNode[];
}

function buildFolderTree(notebooks: Notebook[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  for (const nb of notebooks) nodes.set(nb.id, { notebook: nb, children: [] });
  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    const parentId = node.notebook.parentId;
    const parent = parentId ? nodes.get(parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (list: FolderNode[]): void => {
    list.sort((a, b) =>
      a.notebook.name.localeCompare(b.notebook.name, "vi", {
        sensitivity: "base",
      }),
    );
    for (const n of list) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

function groupNotes(notes: NoteSummary[]): Map<string | null, NoteSummary[]> {
  const map = new Map<string | null, NoteSummary[]>();
  for (const n of notes) {
    const key = n.notebookId ?? null;
    const bucket = map.get(key);
    if (bucket) bucket.push(n);
    else map.set(key, [n]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }
  return map;
}

function loadExpanded(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem("assistant.notes.expanded");
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((v): v is string => typeof v === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function persistExpanded(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      "assistant.notes.expanded",
      JSON.stringify(Array.from(ids)),
    );
  } catch {
    /* ignore */
  }
}

/* -------------------- Drag & drop -------------------- */

type DragRef = { kind: "note" | "folder"; id: string };
type DropTarget = string | "root";

interface NotesDnd {
  drag: DragRef | null;
  dropTarget: DropTarget | null;
  begin: (ref: DragRef) => void;
  end: () => void;
  hover: (target: DropTarget | null) => void;
  canDrop: (target: DropTarget) => boolean;
  drop: (target: DropTarget) => void;
}

const DndContext = createContext<NotesDnd | null>(null);

function useDnd(): NotesDnd {
  const ctx = useContext(DndContext);
  if (!ctx) throw new Error("useDnd must be used inside NotesExplorer");
  return ctx;
}

export function NotesExplorer({
  notebooks,
  notes,
  selectedNoteId,
  search,
  onSearchChange,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onTogglePinNote,
  onMoveNote,
  onCreateNotebook,
  onRenameNotebook,
  onColorNotebook,
  onDeleteNotebook,
  onMoveNotebook,
  tags,
  activeTag,
  onTagChange,
  isLoading,
  notebooksById,
  onLockNotebook,
  onUnlockNotebook,
  onShareNotebook,
}: NotesExplorerProps) {
  const confirm = useConfirm();
  const folderTree = useMemo(() => buildFolderTree(notebooks), [notebooks]);
  const notesByNotebook = useMemo(() => groupNotes(notes), [notes]);
  const uncategorized = notesByNotebook.get(null) ?? [];

  const [expanded, setExpanded] = useState<Set<string>>(() => loadExpanded());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingUnder, setCreatingUnder] = useState<string | "root" | null>(
    null,
  );

  // Auto-expand the chain leading to the currently selected note.
  useEffect(() => {
    if (!selectedNoteId) return;
    const note = notes.find((n) => n.id === selectedNoteId);
    if (!note || !note.notebookId) return;
    const byId = new Map(notebooks.map((n) => [n.id, n]));
    setExpanded((prev) => {
      const next = new Set(prev);
      let cursor: string | null = note.notebookId;
      while (cursor) {
        next.add(cursor);
        cursor = byId.get(cursor)?.parentId ?? null;
      }
      if (next.size === prev.size) return prev;
      persistExpanded(next);
      return next;
    });
  }, [selectedNoteId, notes, notebooks]);

  // When searching, expand everything so matches are visible.
  const isSearching = search.trim().length > 0;

  // While searching, prune folders that have no matching note anywhere in their
  // subtree (notes are already server-filtered to matches).
  const visibleTree = useMemo(() => {
    if (!isSearching) return folderTree;
    const prune = (nodes: FolderNode[]): FolderNode[] =>
      nodes.reduce<FolderNode[]>((acc, node) => {
        const children = prune(node.children);
        const hasMatch =
          (notesByNotebook.get(node.notebook.id)?.length ?? 0) > 0 ||
          children.length > 0;
        if (hasMatch) acc.push({ ...node, children });
        return acc;
      }, []);
    return prune(folderTree);
  }, [isSearching, folderTree, notesByNotebook]);
  const effectiveExpanded = useMemo(() => {
    if (!isSearching) return expanded;
    const all = new Set<string>(expanded);
    for (const nb of notebooks) all.add(nb.id);
    return all;
  }, [expanded, notebooks, isSearching]);

  const toggle = (key: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persistExpanded(next);
      return next;
    });
  };

  const hasExpanded = expanded.size > 0;
  const collapseAll = (): void => {
    setExpanded(() => {
      const next = new Set<string>();
      persistExpanded(next);
      return next;
    });
  };

  const expandAncestors = (notebookId: string): void => {
    const byId = new Map(notebooks.map((n) => [n.id, n]));
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(notebookId);
      let cursor: string | null = byId.get(notebookId)?.parentId ?? null;
      while (cursor) {
        next.add(cursor);
        cursor = byId.get(cursor)?.parentId ?? null;
      }
      persistExpanded(next);
      return next;
    });
  };

  /* ---- drag & drop wiring ---- */
  const [drag, setDrag] = useState<DragRef | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const notebookById = useMemo(
    () => new Map(notebooks.map((n) => [n.id, n])),
    [notebooks],
  );
  const noteById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const nb of notebooks) {
      if (!nb.parentId) continue;
      const bucket = map.get(nb.parentId);
      if (bucket) bucket.push(nb.id);
      else map.set(nb.parentId, [nb.id]);
    }
    return map;
  }, [notebooks]);

  const descendantsOf = useCallback(
    (rootId: string): Set<string> => {
      const out = new Set<string>();
      const stack = [...(childrenByParent.get(rootId) ?? [])];
      while (stack.length) {
        const id = stack.pop() as string;
        if (out.has(id)) continue;
        out.add(id);
        const kids = childrenByParent.get(id);
        if (kids) stack.push(...kids);
      }
      return out;
    },
    [childrenByParent],
  );

  const canDrop = useCallback(
    (target: DropTarget): boolean => {
      if (!drag) return false;
      if (drag.kind === "folder") {
        if (target === "root")
          return notebookById.get(drag.id)?.parentId != null;
        if (target === drag.id) return false;
        if (descendantsOf(drag.id).has(target)) return false;
        return notebookById.get(drag.id)?.parentId !== target;
      }
      const current = noteById.get(drag.id)?.notebookId ?? null;
      return current !== (target === "root" ? null : target);
    },
    [drag, descendantsOf, notebookById, noteById],
  );

  const commitDrop = useCallback(
    (target: DropTarget): void => {
      const active = drag;
      setDrag(null);
      setDropTarget(null);
      if (!active || !canDrop(target)) return;
      const parentId = target === "root" ? null : target;
      if (active.kind === "folder") void onMoveNotebook(active.id, parentId);
      else void onMoveNote(active.id, parentId);
      if (parentId) expandAncestors(parentId);
    },
    [drag, canDrop, onMoveNotebook, onMoveNote, expandAncestors],
  );

  const dnd: NotesDnd = useMemo(
    () => ({
      drag,
      dropTarget,
      begin: setDrag,
      end: () => {
        setDrag(null);
        setDropTarget(null);
      },
      hover: setDropTarget,
      canDrop,
      drop: commitDrop,
    }),
    [drag, dropTarget, canDrop, commitDrop],
  );

  const handleCreateFolder = async (
    name: string,
    parentId: string | null,
  ): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onCreateNotebook({ name: trimmed, parentId });
    if (parentId) expandAncestors(parentId);
    setCreatingUnder(null);
  };

  const handleDeleteFolder = async (
    notebook: Notebook,
    hasChildren: boolean,
  ): Promise<void> => {
    const description = hasChildren
      ? 'Mọi thư mục con sẽ bị xoá. Ghi chú bên trong sẽ chuyển sang "Chưa phân loại".'
      : 'Ghi chú bên trong sẽ chuyển sang "Chưa phân loại".';
    const ok = await confirm({
      title: `Xoá thư mục "${notebook.name}"?`,
      description,
      confirmText: "Xoá",
      variant: "destructive",
    });
    if (ok) await onDeleteNotebook(notebook.id);
  };

  const handleDeleteNote = async (note: NoteSummary): Promise<void> => {
    const ok = await confirm({
      title: `Xoá "${note.title || "Chưa có tiêu đề"}"?`,
      description: "Ghi chú và mọi đính kèm sẽ bị xoá vĩnh viễn.",
      confirmText: "Xoá",
      variant: "destructive",
    });
    if (ok) await onDeleteNote(note.id);
  };

  return (
    <DndContext.Provider value={dnd}>
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <header className="border-b border-sidebar-border">
        <div className="flex items-center gap-1 px-3 pb-1 pt-3">
          <h1 className="text-sm font-semibold text-foreground">Notes</h1>
          <div className="ml-auto flex items-center gap-0.5">
            <TagFilterButton
              tags={tags}
              activeTag={activeTag}
              onChange={onTagChange}
            />
            <IconButton
              title="Thu gọn tất cả thư mục"
              ariaLabel="Thu gọn tất cả thư mục"
              onClick={collapseAll}
              disabled={isSearching || !hasExpanded}
            >
              <CopyMinus className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              title="Thư mục mới"
              ariaLabel="Thư mục mới"
              onClick={() => setCreatingUnder("root")}
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              title="Ghi chú mới"
              ariaLabel="Ghi chú mới"
              onClick={() => void onCreateNote(null)}
            >
              <FilePlus className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>

        <div className="px-3 pb-3 pt-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Tìm ghi chú…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Xóa"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {activeTag && (
          <div className="flex items-center gap-1 border-t border-sidebar-border px-3 py-1.5">
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-accent px-2 text-xs leading-none text-accent-foreground">
              <span className="leading-trim">#{activeTag}</span>
              <button
                type="button"
                onClick={() => onTagChange(null)}
                aria-label="Xóa lọc"
                className="inline-flex shrink-0 text-accent-foreground/70 hover:text-accent-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}
      </header>

      <div
        className={cn(
          "flex-1 overflow-y-auto scrollbar-thin px-1 py-2",
          drag &&
            dropTarget === "root" &&
            canDrop("root") &&
            "rounded-md ring-1 ring-inset ring-primary/40",
        )}
        onDragOver={(e) => {
          if (!canDrop("root")) return;
          e.preventDefault();
          dnd.hover("root");
        }}
        onDrop={(e) => {
          if (!canDrop("root")) return;
          e.preventDefault();
          dnd.drop("root");
        }}
      >
        {isLoading && (
          <div className="space-y-1.5 px-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-6 animate-pulse rounded bg-muted/60"
              />
            ))}
          </div>
        )}

        {!isLoading && (
          <ul className="space-y-0.5">
            {visibleTree.map((node) => (
              <FolderRow
                key={node.notebook.id}
                node={node}
                depth={0}
                expanded={effectiveExpanded}
                editingId={editingId}
                creatingUnder={creatingUnder}
                selectedNoteId={selectedNoteId}
                notesByNotebook={notesByNotebook}
                onToggle={toggle}
                onStartEdit={(id) => setEditingId(id)}
                onCancelEdit={() => setEditingId(null)}
                onStartCreate={(parentId) => {
                  expandAncestors(parentId);
                  setCreatingUnder(parentId);
                }}
                onCancelCreate={() => setCreatingUnder(null)}
                onCreateFolder={handleCreateFolder}
                onRename={async (id, name) => {
                  await onRenameNotebook(id, name);
                  setEditingId(null);
                }}
                onChangeColor={onColorNotebook}
                onRequestDeleteFolder={handleDeleteFolder}
                onSelectNote={onSelectNote}
                onRequestCreateNote={onCreateNote}
                onRequestDeleteNote={handleDeleteNote}
                onRequestTogglePinNote={onTogglePinNote}
                notebooksById={notebooksById}
                onLockNotebook={onLockNotebook}
                onUnlockNotebook={onUnlockNotebook}
                onShareNotebook={onShareNotebook}
              />
            ))}

            {creatingUnder === "root" && (
              <li className="px-1 py-0.5">
                <CreateFolderInline
                  onCancel={() => setCreatingUnder(null)}
                  onSubmit={(name) => handleCreateFolder(name, null)}
                />
              </li>
            )}

            {uncategorized.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                depth={0}
                selected={note.id === selectedNoteId}
                locked={isNoteEffectivelyLocked(note, notebooksById)}
                onSelect={() => onSelectNote(note.id)}
                onDelete={() => void handleDeleteNote(note)}
                onTogglePin={() => void onTogglePinNote(note)}
              />
            ))}

            {visibleTree.length === 0 && uncategorized.length === 0 && (
              <li className="px-3 py-6 text-center text-2xs text-muted-foreground">
                Chưa có thư mục hay ghi chú. Nhấn{" "}
                <FolderPlus className="inline h-3 w-3" /> hoặc{" "}
                <FilePlus className="inline h-3 w-3" /> để bắt đầu.
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
    </DndContext.Provider>
  );
}

interface FolderRowProps {
  node: FolderNode;
  depth: number;
  expanded: Set<string>;
  editingId: string | null;
  creatingUnder: string | "root" | null;
  selectedNoteId: string | null;
  notesByNotebook: Map<string | null, NoteSummary[]>;
  onToggle: (key: string) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onStartCreate: (parentId: string) => void;
  onCancelCreate: () => void;
  onCreateFolder: (name: string, parentId: string | null) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onChangeColor: (id: string, color: string | null) => Promise<void>;
  onRequestDeleteFolder: (
    notebook: Notebook,
    hasChildren: boolean,
  ) => Promise<void>;
  onSelectNote: (id: string) => void;
  onRequestCreateNote: (notebookId: string | null) => Promise<void> | void;
  onRequestDeleteNote: (note: NoteSummary) => Promise<void>;
  onRequestTogglePinNote: (note: NoteSummary) => Promise<void> | void;
  notebooksById: Map<string, Notebook>;
  onLockNotebook: (id: string) => void;
  onUnlockNotebook: (id: string) => void;
  onShareNotebook: (id: string) => void;
}

function FolderRow({
  node,
  depth,
  expanded,
  editingId,
  creatingUnder,
  selectedNoteId,
  notesByNotebook,
  onToggle,
  onStartEdit,
  onCancelEdit,
  onStartCreate,
  onCancelCreate,
  onCreateFolder,
  onRename,
  onChangeColor,
  onRequestDeleteFolder,
  onSelectNote,
  onRequestCreateNote,
  onRequestDeleteNote,
  onRequestTogglePinNote,
  notebooksById,
  onLockNotebook,
  onUnlockNotebook,
  onShareNotebook,
}: FolderRowProps) {
  const dnd = useDnd();
  const { notebook } = node;
  const childNotes = notesByNotebook.get(notebook.id) ?? [];
  const hasChildren = node.children.length > 0;
  const hasContent = hasChildren || childNotes.length > 0;
  const isOpen = expanded.has(notebook.id);
  const isEditing = editingId === notebook.id;
  const showChildCreator = creatingUnder === notebook.id;
  const indent = depth * 12;
  // Cờ riêng quyết định icon "ổ khóa đặc" và nhãn menu; khóa hiệu lực (kể cả do
  // cha bị khóa) chỉ để hiện icon mờ báo nội dung bên trong đang bị che.
  const ownLocked = notebook.isLocked;
  const effLocked = isNotebookEffectivelyLocked(notebook.id, notebooksById);

  const isDragging = dnd.drag?.kind === "folder" && dnd.drag.id === notebook.id;
  const isDropTarget =
    dnd.dropTarget === notebook.id && dnd.canDrop(notebook.id);

  return (
    <li>
      <div
        draggable={!isEditing}
        onDragStart={(e: DragEvent) => {
          e.dataTransfer.effectAllowed = "move";
          dnd.begin({ kind: "folder", id: notebook.id });
        }}
        onDragEnd={dnd.end}
        onDragOver={(e: DragEvent) => {
          if (!dnd.canDrop(notebook.id)) return;
          e.preventDefault();
          e.stopPropagation();
          dnd.hover(notebook.id);
        }}
        onDrop={(e: DragEvent) => {
          if (!dnd.canDrop(notebook.id)) return;
          e.preventDefault();
          e.stopPropagation();
          dnd.drop(notebook.id);
        }}
        className={cn(
          "group/row relative flex items-center rounded-md text-sm transition-colors hover:bg-muted/60",
          isDragging && "opacity-40",
          isDropTarget && "bg-accent ring-1 ring-inset ring-primary/60",
        )}
        style={{ paddingLeft: indent }}
      >
        <button
          type="button"
          onClick={() => onToggle(notebook.id)}
          aria-label={isOpen ? "Thu gọn" : "Mở rộng"}
          className={cn(
            "inline-flex h-7 w-5 shrink-0 items-center justify-center text-muted-foreground",
            !hasContent && "opacity-40",
          )}
        >
          <ChevronRight
            className={cn(
              "h-3 w-3 transition-transform",
              isOpen && "rotate-90",
            )}
          />
        </button>

        {isEditing ? (
          <RenameInline
            initial={notebook.name}
            onCancel={onCancelEdit}
            onSubmit={(name) => onRename(notebook.id, name)}
          />
        ) : (
          <button
            type="button"
            onClick={() => onToggle(notebook.id)}
            onDoubleClick={() => onStartEdit(notebook.id)}
            className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 text-left"
          >
            <span
              aria-hidden
              className="inline-flex h-2 w-2 shrink-0 rounded-full"
              style={{
                background:
                  notebook.color ?? "hsl(var(--muted-foreground) / 0.5)",
              }}
            />
            <span className="truncate text-xs font-medium">
              {notebook.name}
            </span>
            {effLocked && (
              <Lock
                aria-label="Đã khóa"
                className="h-3 w-3 shrink-0 text-muted-foreground"
              />
            )}
          </button>
        )}

        {!isEditing && (
          <div className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
            <IconButton
              title="Ghi chú mới ở đây"
              ariaLabel="Ghi chú mới"
              onClick={() => void onRequestCreateNote(notebook.id)}
            >
              <FilePlus className="h-3.5 w-3.5" />
            </IconButton>
            <FolderMenu
              color={notebook.color}
              isLocked={ownLocked}
              onRename={() => onStartEdit(notebook.id)}
              onCreateChild={() => onStartCreate(notebook.id)}
              onChangeColor={(c) => onChangeColor(notebook.id, c)}
              onLock={() => onLockNotebook(notebook.id)}
              onUnlock={() => onUnlockNotebook(notebook.id)}
              onShare={() => onShareNotebook(notebook.id)}
              onDelete={() =>
                void onRequestDeleteFolder(notebook, hasChildren)
              }
            />
          </div>
        )}
      </div>

      {isOpen && (
        <ul className="space-y-0.5">
          {node.children.map((child) => (
            <FolderRow
              key={child.notebook.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              editingId={editingId}
              creatingUnder={creatingUnder}
              selectedNoteId={selectedNoteId}
              notesByNotebook={notesByNotebook}
              onToggle={onToggle}
              onStartEdit={onStartEdit}
              onCancelEdit={onCancelEdit}
              onStartCreate={onStartCreate}
              onCancelCreate={onCancelCreate}
              onCreateFolder={onCreateFolder}
              onRename={onRename}
              onChangeColor={onChangeColor}
              onRequestDeleteFolder={onRequestDeleteFolder}
              onSelectNote={onSelectNote}
              onRequestCreateNote={onRequestCreateNote}
              onRequestDeleteNote={onRequestDeleteNote}
              onRequestTogglePinNote={onRequestTogglePinNote}
              notebooksById={notebooksById}
              onLockNotebook={onLockNotebook}
              onUnlockNotebook={onUnlockNotebook}
              onShareNotebook={onShareNotebook}
            />
          ))}

          {showChildCreator && (
            <li style={{ paddingLeft: (depth + 1) * 12 + 20 }}>
              <CreateFolderInline
                onCancel={onCancelCreate}
                onSubmit={(name) => onCreateFolder(name, notebook.id)}
              />
            </li>
          )}

          {childNotes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              depth={depth + 1}
              selected={note.id === selectedNoteId}
              locked={isNoteEffectivelyLocked(note, notebooksById)}
              onSelect={() => onSelectNote(note.id)}
              onDelete={() => void onRequestDeleteNote(note)}
              onTogglePin={() => void onRequestTogglePinNote(note)}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

interface NoteRowProps {
  note: NoteSummary;
  depth: number;
  selected: boolean;
  locked: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}

function NoteRow({
  note,
  depth,
  selected,
  locked,
  onSelect,
  onDelete,
  onTogglePin,
}: NoteRowProps) {
  const dnd = useDnd();
  const indent = depth * 12;
  const title = note.title || "Chưa có tiêu đề";
  const isDragging = dnd.drag?.kind === "note" && dnd.drag.id === note.id;

  // Dropping a note onto another note targets that note's own notebook, never
  // the root container. This stops a small accidental drag-and-release near the
  // origin from bubbling up to the root drop zone and yanking the note out of
  // its folder. Folder drags are left to bubble (existing behaviour).
  const noteTarget: DropTarget = note.notebookId ?? "root";

  return (
    <li>
      <div
        draggable
        onDragStart={(e: DragEvent) => {
          e.dataTransfer.effectAllowed = "move";
          dnd.begin({ kind: "note", id: note.id });
        }}
        onDragEnd={dnd.end}
        onDragOver={(e: DragEvent) => {
          if (dnd.drag?.kind !== "note") return;
          if (!dnd.canDrop(noteTarget)) return;
          e.preventDefault();
          e.stopPropagation();
          dnd.hover(noteTarget);
        }}
        onDrop={(e: DragEvent) => {
          if (dnd.drag?.kind !== "note") return;
          if (!dnd.canDrop(noteTarget)) return;
          e.preventDefault();
          e.stopPropagation();
          dnd.drop(noteTarget);
        }}
        className={cn(
          "group/row relative flex items-center rounded-md text-sm transition-colors",
          selected
            ? "bg-accent text-accent-foreground"
            : "text-foreground hover:bg-muted/60",
          isDragging && "opacity-40",
        )}
        style={{ paddingLeft: indent }}
      >
        <span
          aria-hidden
          className="inline-flex h-7 w-5 shrink-0 items-center justify-center"
        />
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 text-left"
        >
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-xs">{title}</span>
          {locked && (
            <Lock
              aria-label="Đã khóa"
              className="h-3 w-3 shrink-0 text-muted-foreground"
            />
          )}
        </button>
        <div className="mr-1 flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            aria-label={note.isPinned ? "Bỏ ghim" : "Ghim"}
            title={note.isPinned ? "Bỏ ghim" : "Ghim"}
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded transition-opacity hover:bg-background",
              note.isPinned
                ? "text-dot-orange opacity-100"
                : "text-muted-foreground opacity-0 hover:text-foreground focus:opacity-100 group-hover/row:opacity-100",
            )}
          >
            <Pin className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Xoá ghi chú"
            title="Xoá"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover/row:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

interface FolderMenuProps {
  color: string | null;
  isLocked: boolean;
  onRename: () => void;
  onCreateChild: () => void;
  onChangeColor: (color: string | null) => void;
  onLock: () => void;
  onUnlock: () => void;
  onShare: () => void;
  onDelete: () => void;
}

function FolderMenu({
  color,
  isLocked,
  onRename,
  onCreateChild,
  onChangeColor,
  onLock,
  onUnlock,
  onShare,
  onDelete,
}: FolderMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="Tùy chọn thư mục"
          className="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onRename}>
          <Pencil className="h-3.5 w-3.5" /> Đổi tên
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCreateChild}>
          <Plus className="h-3.5 w-3.5" /> Thư mục con
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>
          <span className="inline-flex items-center gap-1.5">
            <Palette className="h-3 w-3" />
            Màu
          </span>
        </DropdownMenuLabel>
        <div className="grid grid-cols-8 gap-1 px-2 pb-2">
          <button
            type="button"
            onClick={() => onChangeColor(null)}
            title="Không màu"
            className={cn(
              "h-5 w-5 rounded-full border border-border bg-muted",
              !color && "ring-2 ring-ring",
            )}
          />
          {NOTEBOOK_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              onClick={() => onChangeColor(c.hex)}
              title={c.label}
              className={cn(
                "h-5 w-5 rounded-full border border-border",
                color?.toLowerCase() === c.hex && "ring-2 ring-ring",
              )}
              style={{ background: c.hex }}
            />
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={isLocked ? onUnlock : onLock}>
          {isLocked ? (
            <LockOpen className="h-3.5 w-3.5" />
          ) : (
            <Lock className="h-3.5 w-3.5" />
          )}
          {isLocked ? "Bỏ khóa" : "Khóa thư mục"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onShare}>
          <Share2 className="h-3.5 w-3.5" /> Chia sẻ
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" /> Xoá
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface TagFilterButtonProps {
  tags: Tag[];
  activeTag: string | null;
  onChange: (tag: string | null) => void;
}

function TagFilterButton({ tags, activeTag, onChange }: TagFilterButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
            activeTag && "text-foreground",
          )}
          aria-label="Lọc theo tag"
          title="Lọc theo tag"
        >
          <TagIcon className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Lọc theo tag</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <span className="text-muted-foreground">Tất cả tag</span>
        </DropdownMenuItem>
        {tags.length === 0 && (
          <div className="px-2 py-2 text-2xs text-muted-foreground">
            Chưa có tag.
          </div>
        )}
        {tags.map((tag) => (
          <DropdownMenuItem
            key={tag.id}
            onSelect={() => onChange(tag.name)}
            className={cn(activeTag === tag.name && "bg-accent")}
          >
            <span className="text-muted-foreground">#</span>
            {tag.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface IconButtonProps {
  title: string;
  ariaLabel: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}

function IconButton({
  title,
  ariaLabel,
  onClick,
  disabled,
  children,
}: IconButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      aria-label={ariaLabel}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

interface RenameInlineProps {
  initial: string;
  onCancel: () => void;
  onSubmit: (value: string) => Promise<void> | void;
}

function RenameInline({ initial, onCancel, onSubmit }: RenameInlineProps) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);

  const submit = async (e?: FormEvent): Promise<void> => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || trimmed === initial) {
      onCancel();
      return;
    }
    setBusy(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-1 items-center py-0.5 pr-1">
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void submit()}
        onKeyDown={onKey}
        disabled={busy}
        className="h-7 text-xs"
      />
    </form>
  );
}

interface CreateFolderInlineProps {
  onCancel: () => void;
  onSubmit: (value: string) => Promise<void> | void;
}

function CreateFolderInline({ onCancel, onSubmit }: CreateFolderInlineProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e?: FormEvent): Promise<void> => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      onCancel();
      return;
    }
    setBusy(true);
    try {
      await onSubmit(trimmed);
      setValue("");
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-1 py-0.5">
      <span aria-hidden className="inline-flex h-2 w-2 rounded-full bg-muted" />
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void submit()}
        onKeyDown={onKey}
        disabled={busy}
        placeholder="Tên thư mục"
        className="h-7 text-xs"
      />
    </form>
  );
}
