import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type {
  Note,
  NoteListResponse,
  NoteSummary,
  Notebook,
  Tag,
} from "@assistant/shared";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { api, ApiError } from "../lib/api";
import { cn } from "../lib/cn";

type NotebookFilter = string | "all" | "none";

interface NotesFilter {
  notebookId: NotebookFilter;
  tag: string | null;
  q: string;
}

const DEFAULT_FILTER: NotesFilter = {
  notebookId: "all",
  tag: null,
  q: "",
};

export function NotesPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<NotesFilter>(DEFAULT_FILTER);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQ(filter.q.trim()), 300);
    return () => clearTimeout(handle);
  }, [filter.q]);

  const notebooksQuery = useQuery({
    queryKey: ["notebooks"],
    queryFn: api.listNotebooks,
  });

  const tagsQuery = useQuery({
    queryKey: ["tags"],
    queryFn: api.listTags,
  });

  const listQueryKey = useMemo(
    () =>
      [
        "notes",
        {
          notebookId: filter.notebookId,
          tag: filter.tag,
          q: debouncedQ,
        },
      ] as const,
    [filter.notebookId, filter.tag, debouncedQ],
  );

  const notesQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      api.listNotes({
        q: debouncedQ || undefined,
        notebookId:
          filter.notebookId === "all" ? undefined : filter.notebookId,
        tag: filter.tag ?? undefined,
        limit: 50,
        page: 1,
      }),
  });

  const items: NoteSummary[] = notesQuery.data?.items ?? [];

  useEffect(() => {
    if (!selectedId && items.length > 0) {
      setSelectedId(items[0].id);
    }
    if (selectedId && !items.some((n) => n.id === selectedId)) {
      setSelectedId(items[0]?.id ?? null);
    }
  }, [items, selectedId]);

  const selectedQuery = useQuery({
    queryKey: ["note", selectedId],
    queryFn: () => api.getNote(selectedId as string),
    enabled: Boolean(selectedId),
  });

  const invalidateLists = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["notes"] });
  }, [qc]);

  const createNote = useMutation({
    mutationFn: api.createNote,
    onSuccess: (note) => {
      invalidateLists();
      void qc.invalidateQueries({ queryKey: ["tags"] });
      setSelectedId(note.id);
    },
  });

  const handleCreate = async (): Promise<void> => {
    await createNote.mutateAsync({
      title: "Ghi chú mới",
      contentHtml: "",
      notebookId:
        filter.notebookId === "all" || filter.notebookId === "none"
          ? null
          : filter.notebookId,
      tags: filter.tag ? [filter.tag] : [],
    });
  };

  return (
    <section className="mx-auto grid h-[calc(100vh-3.5rem)] max-w-7xl grid-cols-1 gap-0 px-0 md:grid-cols-[240px_320px_1fr]">
      <aside className="border-r bg-muted/20 p-4 md:block">
        <Sidebar
          notebooks={notebooksQuery.data ?? []}
          tags={tagsQuery.data ?? []}
          filter={filter}
          onChange={(next) => setFilter(next)}
          onNotebookCreated={() => {
            void qc.invalidateQueries({ queryKey: ["notebooks"] });
          }}
          onTagDeleted={() => {
            void qc.invalidateQueries({ queryKey: ["tags"] });
            invalidateLists();
          }}
        />
      </aside>

      <div className="flex flex-col border-r">
        <div className="flex items-center gap-2 border-b p-3">
          <Input
            placeholder="Tìm trong notes…"
            value={filter.q}
            onChange={(e) =>
              setFilter((f) => ({ ...f, q: e.target.value }))
            }
          />
          <Button
            size="sm"
            onClick={() => void handleCreate()}
            disabled={createNote.isPending}
            title="Tạo ghi chú mới"
          >
            +
          </Button>
        </div>
        <NoteList
          query={notesQuery.data}
          isLoading={notesQuery.isLoading}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      <main className="flex flex-col overflow-hidden">
        {selectedId && selectedQuery.data ? (
          <NoteEditor
            key={selectedId}
            note={selectedQuery.data}
            notebooks={notebooksQuery.data ?? []}
            onSaved={(note) => {
              qc.setQueryData(["note", note.id], note);
              invalidateLists();
              void qc.invalidateQueries({ queryKey: ["tags"] });
            }}
            onDeleted={() => {
              setSelectedId(null);
              invalidateLists();
            }}
          />
        ) : (
          <div className="m-auto text-sm text-muted-foreground">
            Chọn một ghi chú hoặc nhấn <kbd>+</kbd> để tạo mới
          </div>
        )}
      </main>
    </section>
  );
}

interface SidebarProps {
  notebooks: Notebook[];
  tags: Tag[];
  filter: NotesFilter;
  onChange: (next: NotesFilter) => void;
  onNotebookCreated: () => void;
  onTagDeleted: () => void;
}

function Sidebar({
  notebooks,
  tags,
  filter,
  onChange,
  onNotebookCreated,
  onTagDeleted,
}: SidebarProps) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createNotebook = useMutation({
    mutationFn: api.createNotebook,
    onSuccess: () => {
      setNewName("");
      setError(null);
      onNotebookCreated();
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : "Lỗi tạo notebook");
    },
  });

  const deleteTag = useMutation({
    mutationFn: api.deleteTag,
    onSuccess: () => onTagDeleted(),
  });

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    createNotebook.mutate({ name });
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Notebooks
        </div>
        <ul className="space-y-0.5 text-sm">
          <SidebarRow
            label="Tất cả"
            active={filter.notebookId === "all" && !filter.tag}
            onClick={() => onChange({ ...filter, notebookId: "all", tag: null })}
          />
          <SidebarRow
            label="Chưa phân loại"
            active={filter.notebookId === "none"}
            onClick={() =>
              onChange({ ...filter, notebookId: "none", tag: null })
            }
          />
          {notebooks.map((nb) => (
            <SidebarRow
              key={nb.id}
              label={nb.name}
              color={nb.color ?? undefined}
              active={filter.notebookId === nb.id}
              onClick={() =>
                onChange({ ...filter, notebookId: nb.id, tag: null })
              }
            />
          ))}
        </ul>
        <form onSubmit={onSubmit} className="mt-2 flex gap-1">
          <Input
            placeholder="Notebook mới"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-8 text-xs"
          />
          <Button
            size="sm"
            type="submit"
            disabled={createNotebook.isPending || !newName.trim()}
          >
            +
          </Button>
        </form>
        {error && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Tags
        </div>
        <ul className="space-y-0.5 text-sm">
          {tags.length === 0 && (
            <li className="text-xs text-muted-foreground">
              Chưa có tag nào
            </li>
          )}
          {tags.map((t) => (
            <li
              key={t.id}
              className={cn(
                "group flex items-center justify-between rounded px-2 py-1 hover:bg-accent",
                filter.tag === t.name && "bg-accent font-medium",
              )}
            >
              <button
                type="button"
                className="flex-1 truncate text-left"
                onClick={() =>
                  onChange({
                    ...filter,
                    tag: filter.tag === t.name ? null : t.name,
                  })
                }
              >
                #{t.name}
              </button>
              <button
                type="button"
                className="invisible text-xs text-muted-foreground group-hover:visible"
                onClick={() => {
                  if (confirm(`Xoá tag "${t.name}"?`)) deleteTag.mutate(t.id);
                }}
                aria-label={`Xoá tag ${t.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

interface SidebarRowProps {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}

function SidebarRow({ label, active, color, onClick }: SidebarRowProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent",
          active && "bg-accent font-medium",
        )}
      >
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{
            background: color ?? "transparent",
            border: color ? "0" : "1px solid currentColor",
          }}
        />
        <span className="truncate">{label}</span>
      </button>
    </li>
  );
}

interface NoteListProps {
  query: NoteListResponse | undefined;
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function NoteList({ query, isLoading, selectedId, onSelect }: NoteListProps) {
  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Đang tải…</div>
    );
  }
  const items = query?.items ?? [];
  if (items.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Không có ghi chú nào
      </div>
    );
  }
  return (
    <ul className="flex-1 divide-y overflow-y-auto">
      {items.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            onClick={() => onSelect(n.id)}
            className={cn(
              "block w-full px-3 py-2 text-left hover:bg-accent",
              selectedId === n.id && "bg-accent",
            )}
          >
            <div className="flex items-center gap-2">
              {n.isPinned && (
                <span aria-label="pinned" title="Pinned">
                  📌
                </span>
              )}
              <span className="truncate font-medium">{n.title}</span>
            </div>
            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {n.excerpt || "(trống)"}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <time>{formatDate(n.updatedAt)}</time>
              {n.tags.map((t) => (
                <span
                  key={t.id}
                  className="rounded-full bg-muted px-1.5 py-0.5"
                >
                  #{t.name}
                </span>
              ))}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

interface NoteEditorProps {
  note: Note;
  notebooks: Notebook[];
  onSaved: (note: Note) => void;
  onDeleted: () => void;
}

function NoteEditor({ note, notebooks, onSaved, onDeleted }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [notebookId, setNotebookId] = useState<string | null>(note.notebookId);
  const [isPinned, setIsPinned] = useState(note.isPinned);
  const [tagsInput, setTagsInput] = useState(
    note.tags.map((t) => t.name).join(", "),
  );
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [contentHtml, setContentHtml] = useState(note.contentHtml);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(note.title);
    setNotebookId(note.notebookId);
    setIsPinned(note.isPinned);
    setTagsInput(note.tags.map((t) => t.name).join(", "));
    setContentHtml(note.contentHtml);
    if (editorRef.current) {
      editorRef.current.innerHTML = note.contentHtml;
    }
  }, [
    note.id,
    note.title,
    note.notebookId,
    note.isPinned,
    note.contentHtml,
    note.tags,
  ]);

  const save = useMutation({
    mutationFn: () =>
      api.updateNote(note.id, {
        title: title.trim() || "Không tiêu đề",
        contentHtml,
        notebookId,
        isPinned,
        tags: parseTags(tagsInput),
      }),
    onSuccess: (saved) => {
      setError(null);
      onSaved(saved);
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : "Lưu thất bại");
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteNote(note.id),
    onSuccess: onDeleted,
  });

  const uploadAttachment = useMutation({
    mutationFn: (file: File) => api.uploadAttachment(note.id, file),
    onSuccess: (a) => {
      onSaved({ ...note, attachments: [...note.attachments, a] });
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : "Upload thất bại");
    },
  });

  const deleteAttachment = useMutation({
    mutationFn: (id: string) => api.deleteAttachment(id),
    onSuccess: (_, id) => {
      onSaved({
        ...note,
        attachments: note.attachments.filter((a) => a.id !== id),
      });
    },
  });

  const onEditorKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save.mutate();
    }
  };

  const onFileSelected = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) uploadAttachment.mutate(file);
    e.target.value = "";
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b p-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => save.mutate()}
          className="min-w-[12rem] flex-1 text-base font-semibold"
          placeholder="Tiêu đề ghi chú"
        />
        <select
          value={notebookId ?? ""}
          onChange={(e) => setNotebookId(e.target.value || null)}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">(Không notebook)</option>
          {notebooks.map((nb) => (
            <option key={nb.id} value={nb.id}>
              {nb.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={isPinned}
            onChange={(e) => setIsPinned(e.target.checked)}
          />
          Pin
        </label>
        <Button
          size="sm"
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          {save.isPending ? "Đang lưu…" : "Lưu"}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => {
            if (confirm("Xoá ghi chú này?")) remove.mutate();
          }}
        >
          Xoá
        </Button>
      </header>

      <div className="border-b px-3 py-2">
        <Input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          onBlur={() => save.mutate()}
          placeholder="Tags (phân cách bằng dấu phẩy)"
          className="h-8 text-xs"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="border-b bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
        >
          {error}
        </p>
      )}

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) =>
          setContentHtml((e.target as HTMLDivElement).innerHTML)
        }
        onKeyDown={onEditorKeyDown}
        className="prose prose-sm max-w-none flex-1 overflow-y-auto p-4 focus:outline-none"
        aria-label="Nội dung ghi chú"
        spellCheck
      />

      <footer className="border-t p-3">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Đính kèm:</span>
          <label className="cursor-pointer rounded border px-2 py-0.5 hover:bg-accent">
            + Upload
            <input type="file" className="hidden" onChange={onFileSelected} />
          </label>
          {uploadAttachment.isPending && <span>Đang upload…</span>}
        </div>
        {note.attachments.length > 0 && (
          <ul className="flex flex-wrap gap-2 text-xs">
            {note.attachments.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-1 rounded border px-2 py-1"
              >
                <a
                  href={api.attachmentUrl(a.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {a.originalName}
                </a>
                <span className="text-muted-foreground">
                  ({formatSize(a.sizeBytes)})
                </span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (confirm("Xoá file đính kèm?"))
                      deleteAttachment.mutate(a.id);
                  }}
                  aria-label={`Xoá ${a.originalName}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </footer>
    </div>
  );
}

function parseTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
