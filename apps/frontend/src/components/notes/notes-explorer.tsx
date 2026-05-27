import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { NoteSummary, Notebook, Tag } from "@assistant/shared";
import {
  ChevronRight,
  FileText,
  FilePlus,
  FolderPlus,
  MoreHorizontal,
  Palette,
  Pencil,
  Pin,
  Plus,
  Search,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "../../lib/cn";
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
  onCreateNotebook: (input: {
    name: string;
    parentId: string | null;
  }) => Promise<void>;
  onRenameNotebook: (id: string, name: string) => Promise<void>;
  onColorNotebook: (id: string, color: string | null) => Promise<void>;
  onDeleteNotebook: (id: string) => Promise<void>;
  tags: Tag[];
  activeTag: string | null;
  onTagChange: (tag: string | null) => void;
  isLoading?: boolean;
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

export function NotesExplorer({
  notebooks,
  notes,
  selectedNoteId,
  search,
  onSearchChange,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onCreateNotebook,
  onRenameNotebook,
  onColorNotebook,
  onDeleteNotebook,
  tags,
  activeTag,
  onTagChange,
  isLoading,
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

        <div className="relative px-3 pb-3 pt-1">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
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
              className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Xóa"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {activeTag && (
          <div className="flex items-center gap-1 border-t border-sidebar-border px-3 py-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
              #{activeTag}
              <button
                type="button"
                onClick={() => onTagChange(null)}
                aria-label="Xóa lọc"
                className="text-accent-foreground/70 hover:text-accent-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-1 py-2">
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
            {folderTree.map((node) => (
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
                onSelect={() => onSelectNote(note.id)}
                onDelete={() => void handleDeleteNote(note)}
              />
            ))}

            {folderTree.length === 0 && uncategorized.length === 0 && (
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
}: FolderRowProps) {
  const { notebook } = node;
  const childNotes = notesByNotebook.get(notebook.id) ?? [];
  const hasChildren = node.children.length > 0;
  const hasContent = hasChildren || childNotes.length > 0;
  const isOpen = expanded.has(notebook.id);
  const isEditing = editingId === notebook.id;
  const showChildCreator = creatingUnder === notebook.id;
  const indent = depth * 12;

  return (
    <li>
      <div
        className={cn(
          "group/row relative flex items-center rounded-md text-sm transition-colors hover:bg-muted/60",
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
              onRename={() => onStartEdit(notebook.id)}
              onCreateChild={() => onStartCreate(notebook.id)}
              onChangeColor={(c) => onChangeColor(notebook.id, c)}
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
              onSelect={() => onSelectNote(note.id)}
              onDelete={() => void onRequestDeleteNote(note)}
            />
          ))}

          {!hasContent && (
            <li
              className="text-2xs text-muted-foreground"
              style={{ paddingLeft: (depth + 1) * 12 + 20 }}
            >
              <span className="block py-1 italic">Trống</span>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

interface NoteRowProps {
  note: NoteSummary;
  depth: number;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function NoteRow({ note, depth, selected, onSelect, onDelete }: NoteRowProps) {
  const indent = depth * 12;
  const title = note.title || "Chưa có tiêu đề";
  return (
    <li>
      <div
        className={cn(
          "group/row relative flex items-start rounded-md text-sm transition-colors",
          selected
            ? "bg-accent text-accent-foreground"
            : "text-foreground hover:bg-muted/60",
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
          {note.isPinned && (
            <Pin
              className="h-3 w-3 shrink-0 text-dot-orange"
              aria-label="Đã ghim"
            />
          )}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label="Tùy chọn ghi chú"
              className="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground focus:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={onSelect}>
              <FileText className="h-3.5 w-3.5" /> Mở ghi chú
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
      </div>
    </li>
  );
}

interface FolderMenuProps {
  color: string | null;
  onRename: () => void;
  onCreateChild: () => void;
  onChangeColor: (color: string | null) => void;
  onDelete: () => void;
}

function FolderMenu({
  color,
  onRename,
  onCreateChild,
  onChangeColor,
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
  children: ReactNode;
}

function IconButton({ title, ariaLabel, onClick, children }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      aria-label={ariaLabel}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
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
