import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type {
  CreateNotebookInput,
  Note,
  Notebook,
  NoteSummary,
  UpdateNoteInput,
  UpdateNotebookInput,
} from "@assistant/shared";
import {
  ArrowLeft,
  ChevronDown,
  FolderTree,
  Paperclip,
  Pin,
  PinOff,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { NoteEditor } from "../components/editor/note-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import { useConfirm } from "../components/ui/confirm-dialog";
import { NotesExplorer } from "../components/notes/notes-explorer";
import { api, ApiError } from "../lib/api";
import { cn } from "../lib/cn";

const NOTES_LIST_LIMIT = 200;

export function NotesPage() {
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const navigate = useNavigate();
  const { note: routeNoteId } = useSearch({ from: "/notes" });
  const selectedId = routeNoteId ?? null;
  const setSelectedId = useCallback(
    (id: string | null) => {
      void navigate({
        to: "/notes",
        search: { note: id ?? undefined },
        // Deselecting (id === null) is a corrective navigation — clearing a
        // deleted/invalid note — not a place the user should reach with Back.
        // Selecting a note pushes so Back returns to the previous note.
        replace: id === null,
      });
    },
    [navigate],
  );
  const [autoFocusNoteId, setAutoFocusNoteId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "editor">(
    routeNoteId ? "editor" : "list",
  );
  const [explorerSheetOpen, setExplorerSheetOpen] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQ(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const notebooksQuery = useQuery({
    queryKey: ["notebooks"],
    queryFn: api.listNotebooks,
  });

  const tagsQuery = useQuery({
    queryKey: ["tags"],
    queryFn: api.listTags,
  });

  const notebooks = notebooksQuery.data ?? [];

  const notesQuery = useQuery({
    queryKey: ["notes", { q: debouncedQ, tag: activeTag }] as const,
    queryFn: () =>
      api.listNotes({
        q: debouncedQ || undefined,
        tag: activeTag ?? undefined,
        limit: NOTES_LIST_LIMIT,
        page: 1,
      }),
  });

  const notes = notesQuery.data?.items ?? [];

  const selectedQuery = useQuery({
    queryKey: ["note", selectedId],
    queryFn: () => api.getNote(selectedId as string),
    enabled: Boolean(selectedId),
  });

  useEffect(() => {
    if (!selectedId || !selectedQuery.isError) return;
    // Only clear when the note is genuinely gone (404) or forbidden (403).
    // Transient errors (500, network) must keep ?note=<id> so a retry/reload
    // can still restore the note instead of silently losing the user's place.
    const err = selectedQuery.error;
    const gone =
      err instanceof ApiError && (err.status === 404 || err.status === 403);
    if (gone) setSelectedId(null);
  }, [selectedId, selectedQuery.isError, selectedQuery.error, setSelectedId]);

  const invalidateLists = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["notes"] });
  }, [qc]);

  const invalidateNotebooks = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["notebooks"] });
  }, [qc]);

  const createNote = useMutation({
    mutationFn: api.createNote,
    onSuccess: (note) => {
      invalidateLists();
      void qc.invalidateQueries({ queryKey: ["tags"] });
      setSelectedId(note.id);
      setAutoFocusNoteId(note.id);
      setMobileView("editor");
      setExplorerSheetOpen(false);
    },
  });

  const patchNote = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateNoteInput }) =>
      api.updateNote(id, input),
    onSuccess: (saved) => {
      invalidateLists();
      qc.setQueryData(["note", saved.id], saved);
    },
  });

  const deleteNote = useMutation({
    mutationFn: (id: string) => api.deleteNote(id),
    onSuccess: (_void, id) => {
      invalidateLists();
      if (selectedId === id) setSelectedId(null);
    },
  });

  const createNotebookMut = useMutation({
    mutationFn: (input: CreateNotebookInput) => api.createNotebook(input),
    onSuccess: () => invalidateNotebooks(),
  });

  const updateNotebookMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateNotebookInput }) =>
      api.updateNotebook(id, input),
    onSuccess: () => invalidateNotebooks(),
  });

  const deleteNotebookMut = useMutation({
    mutationFn: (id: string) => api.deleteNotebook(id),
    onSuccess: () => {
      invalidateNotebooks();
      // Notes whose notebook was deleted now have notebookId=null (DB SET NULL).
      invalidateLists();
    },
  });

  const handleCreateNote = useCallback(
    async (notebookId: string | null): Promise<void> => {
      await createNote.mutateAsync({
        title: "Ghi chú mới",
        contentHtml: "",
        notebookId,
        tags: activeTag ? [activeTag] : [],
      });
    },
    [activeTag, createNote],
  );

  const handleSelectNote = useCallback(
    (id: string): void => {
      setSelectedId(id);
      setMobileView("editor");
      setExplorerSheetOpen(false);
    },
    [setSelectedId],
  );

  const explorer = (
    <NotesExplorer
      notebooks={notebooks}
      notes={notes}
      selectedNoteId={selectedId}
      search={searchInput}
      onSearchChange={setSearchInput}
      onSelectNote={handleSelectNote}
      onCreateNote={handleCreateNote}
      onDeleteNote={async (id) => {
        await deleteNote.mutateAsync(id);
      }}
      onTogglePinNote={async (note: NoteSummary) => {
        await patchNote.mutateAsync({
          id: note.id,
          input: { isPinned: !note.isPinned },
        });
      }}
      onMoveNote={async (noteId, notebookId) => {
        await patchNote.mutateAsync({ id: noteId, input: { notebookId } });
      }}
      onCreateNotebook={async ({ name, parentId }) => {
        await createNotebookMut.mutateAsync({ name, parentId });
      }}
      onRenameNotebook={async (id, name) => {
        await updateNotebookMut.mutateAsync({ id, input: { name } });
      }}
      onColorNotebook={async (id, color) => {
        await updateNotebookMut.mutateAsync({ id, input: { color } });
      }}
      onDeleteNotebook={async (id) => {
        await deleteNotebookMut.mutateAsync(id);
      }}
      onMoveNotebook={async (id, parentId) => {
        await updateNotebookMut.mutateAsync({ id, input: { parentId } });
      }}
      tags={tagsQuery.data ?? []}
      activeTag={activeTag}
      onTagChange={setActiveTag}
      isLoading={notesQuery.isLoading || notebooksQuery.isLoading}
    />
  );

  return (
    <section className="flex h-full min-h-0 overflow-hidden">
      <aside
        className={cn(
          "flex w-full flex-col border-r border-sidebar-border md:w-[340px] md:shrink-0",
          mobileView === "editor" && "hidden md:flex",
        )}
      >
        {explorer}
      </aside>

      <Sheet open={explorerSheetOpen} onOpenChange={setExplorerSheetOpen}>
        <SheetContent
          side="left"
          className="w-[300px] bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Notes</SheetTitle>
          </SheetHeader>
          {explorer}
        </SheetContent>
      </Sheet>

      <main
        className={cn(
          "flex min-w-0 flex-1 flex-col bg-background",
          mobileView === "list" && "hidden md:flex",
        )}
      >
        {selectedId ? (
          selectedQuery.data ? (
          <NoteWorkspace
            key={selectedId}
            note={selectedQuery.data}
            notebooks={notebooks}
            autoFocus={selectedId === autoFocusNoteId}
            onBack={() => setMobileView("list")}
            onOpenExplorer={() => setExplorerSheetOpen(true)}
            onSaved={(note) => {
              qc.setQueryData(["note", note.id], note);
              invalidateLists();
              void qc.invalidateQueries({ queryKey: ["tags"] });
            }}
            onDeleted={() => {
              setSelectedId(null);
              setMobileView("list");
              invalidateLists();
            }}
          />
          ) : (
            <div className="m-auto flex items-center justify-center text-sm text-muted-foreground">
              Đang tải…
            </div>
          )
        ) : (
          <EmptyState onCreate={() => void handleCreateNote(null)} />
        )}
      </main>
    </section>
  );
}

/* -------------------- Editor workspace -------------------- */

interface NoteWorkspaceProps {
  note: Note;
  notebooks: Notebook[];
  autoFocus?: boolean;
  onSaved: (note: Note) => void;
  onDeleted: () => void;
  onBack: () => void;
  onOpenExplorer: () => void;
}

function NoteWorkspace({
  note,
  notebooks,
  autoFocus,
  onSaved,
  onDeleted,
  onBack,
  onOpenExplorer,
}: NoteWorkspaceProps) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [title, setTitle] = useState(note.title);
  const [contentHtml, setContentHtml] = useState(note.contentHtml ?? "");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(note.tags.map((t) => t.name));
  const [notebookId, setNotebookId] = useState<string | null>(note.notebookId);
  const [isPinned, setIsPinned] = useState(note.isPinned);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTitle(note.title);
    setContentHtml(note.contentHtml ?? "");
    setTags(note.tags.map((t) => t.name));
    setNotebookId(note.notebookId);
    setIsPinned(note.isPinned);
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Freshly created notes drop the cursor straight into the title.
  useEffect(() => {
    if (!autoFocus) return;
    const handle = setTimeout(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
    }, 0);
    return () => clearTimeout(handle);
  }, [autoFocus]);

  const update = useMutation({
    mutationFn: (payload: {
      title: string;
      contentHtml: string;
      notebookId: string | null;
      tags: string[];
      isPinned: boolean;
    }) => api.updateNote(note.id, payload),
    onSuccess: (saved) => {
      setSavedAt(new Date());
      setError(null);
      onSaved(saved);
    },
    onError: (e: unknown) => {
      setError(e instanceof ApiError ? e.message : "Lỗi lưu ghi chú");
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteNote(note.id),
    onSuccess: () => onDeleted(),
  });

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadAttachment(note.id, file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["note", note.id] });
    },
  });

  const removeAttachment = useMutation({
    mutationFn: (id: string) => api.deleteAttachment(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["note", note.id] });
    },
  });

  const save = () =>
    update.mutate({
      title: title.trim() || "Chưa có tiêu đề",
      contentHtml,
      notebookId,
      tags,
      isPinned,
    });

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, "").toLowerCase();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]);
    setTagInput("");
  };

  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === "Backspace" && !tagInput && tags.length) {
      setTags(tags.slice(0, -1));
    }
  };

  const dirty =
    title !== note.title ||
    contentHtml !== (note.contentHtml ?? "") ||
    tags.join() !== note.tags.map((t) => t.name).join() ||
    notebookId !== note.notebookId ||
    isPinned !== note.isPinned;

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      update.mutate({
        title: title.trim() || "Chưa có tiêu đề",
        contentHtml,
        notebookId,
        tags,
        isPinned,
      });
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, contentHtml, tags, notebookId, isPinned, dirty]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2 md:px-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted md:hidden"
          aria-label="Quay lại danh sách"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onOpenExplorer}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
          aria-label="Mở danh sách thư mục"
          title="Thư mục"
        >
          <FolderTree className="h-4 w-4" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs leading-none hover:bg-muted"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{
                  background:
                    notebooks.find((n) => n.id === notebookId)?.color ??
                    "hsl(var(--muted-foreground))",
                }}
              />
              <span className="leading-trim">
                {notebooks.find((n) => n.id === notebookId)?.name ??
                  "Chưa phân loại"}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 overflow-auto">
            <DropdownMenuItem onSelect={() => setNotebookId(null)}>
              Chưa phân loại
            </DropdownMenuItem>
            {flattenNotebooks(notebooks).map((row) => (
              <DropdownMenuItem
                key={row.notebook.id}
                onSelect={() => setNotebookId(row.notebook.id)}
              >
                <span style={{ paddingLeft: row.depth * 10 }} />
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background:
                      row.notebook.color ?? "hsl(var(--muted-foreground))",
                  }}
                />
                {row.notebook.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-1">
          <span className="text-2xs text-muted-foreground">
            {update.isPending
              ? "Đang lưu…"
              : dirty
                ? "Đang chờ lưu…"
                : savedAt
                  ? `Đã lưu ${formatRelative(savedAt.toISOString())}`
                  : "Đã lưu"}
          </span>
          <button
            type="button"
            onClick={() => setIsPinned((p) => !p)}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted",
              isPinned ? "text-dot-orange" : "text-muted-foreground",
            )}
            title={isPinned ? "Bỏ ghim" : "Ghim"}
            aria-label={isPinned ? "Bỏ ghim" : "Ghim"}
          >
            {isPinned ? (
              <Pin className="h-4 w-4" />
            ) : (
              <PinOff className="h-4 w-4" />
            )}
          </button>
          <label
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Đính kèm"
          >
            <Paperclip className="h-4 w-4" />
            <input
              type="file"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload.mutate(file);
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={async () => {
              const ok = await confirm({
                title: "Xóa ghi chú này?",
                description: "Ghi chú và mọi đính kèm sẽ bị xóa vĩnh viễn.",
                confirmText: "Xóa",
                variant: "destructive",
              });
              if (ok) remove.mutate();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Xóa"
            aria-label="Xóa"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="border-b border-border pb-3 pt-4 md:pt-6">
        <div className="mx-auto w-full max-w-[768px] px-6 md:px-10 lg:max-w-[900px] xl:max-w-[1150px] 2xl:max-w-[1400px]">
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tiêu đề ghi chú"
            className="w-full bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="group/tag inline-flex items-center rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground transition-colors"
              >
                <span className="leading-trim">{tag}</span>
                <button
                  type="button"
                  onClick={() => setTags(tags.filter((t) => t !== tag))}
                  aria-label={`Xoá tag ${tag}`}
                  title="Xoá tag"
                  className="ml-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full text-accent-foreground/60 transition-colors hover:bg-accent-foreground/15 hover:text-accent-foreground group-hover/tag:inline-flex"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={onTagKey}
              onBlur={() => addTag(tagInput)}
              placeholder="Thêm tag…"
              className="h-6 bg-transparent text-xs leading-none outline-none placeholder:text-muted-foreground/60"
            />
          </div>
          {error && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>

      <NoteEditor
        value={contentHtml}
        onChange={setContentHtml}
        onSave={save}
        placeholder="Viết ghi chú… nhấn / để format"
      />

      {note.attachments.length > 0 && (
        <div className="border-t border-border bg-muted/30 px-4 py-3 md:px-8">
          <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Đính kèm
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {note.attachments.map((att) => (
              <li
                key={att.id}
                className="group inline-flex h-7 items-center gap-2 rounded-md border border-border bg-card px-2 text-xs leading-none"
              >
                <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                <a
                  href={`/api/attachments/${att.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="max-w-[200px] truncate leading-trim hover:underline"
                >
                  {att.originalName}
                </a>
                <button
                  type="button"
                  onClick={() => removeAttachment.mutate(att.id)}
                  className="inline-flex shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                  aria-label="Xóa đính kèm"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="m-auto flex max-w-sm flex-col items-center gap-3 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <Star className="h-6 w-6" />
      </div>
      <div>
        <h2 className="text-base font-semibold">Chưa chọn ghi chú</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Chọn từ danh sách bên trái, hoặc tạo mới ngay bây giờ.
        </p>
      </div>
      <Button onClick={onCreate} className="gap-1.5">
        <Plus className="h-4 w-4" /> Ghi chú mới
      </Button>
    </div>
  );
}

/* -------------------- Helpers -------------------- */

interface FlattenedNotebookRow {
  notebook: Notebook;
  depth: number;
}

function flattenNotebooks(notebooks: Notebook[]): FlattenedNotebookRow[] {
  const childrenByParent = new Map<string | null, Notebook[]>();
  for (const nb of notebooks) {
    const key = nb.parentId ?? null;
    const bucket = childrenByParent.get(key);
    if (bucket) bucket.push(nb);
    else childrenByParent.set(key, [nb]);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) =>
      a.name.localeCompare(b.name, "vi", { sensitivity: "base" }),
    );
  }
  const out: FlattenedNotebookRow[] = [];
  const walk = (parentId: string | null, depth: number): void => {
    const children = childrenByParent.get(parentId) ?? [];
    for (const child of children) {
      out.push({ notebook: child, depth });
      walk(child.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

const rtf = new Intl.RelativeTimeFormat("vi-VN", { numeric: "auto" });
function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86_400 * 7) return rtf.format(Math.round(diff / 86_400), "day");
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}
