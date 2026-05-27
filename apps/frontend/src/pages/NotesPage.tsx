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
  type KeyboardEvent,
} from "react";
import type {
  Note,
  NoteSummary,
  Notebook,
  Tag,
} from "@assistant/shared";
import {
  ArrowLeft,
  ChevronDown,
  Filter,
  Paperclip,
  Pin,
  PinOff,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { NoteEditor } from "../components/editor/note-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
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
  const [mobileView, setMobileView] = useState<"list" | "editor">("list");

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
      setMobileView("editor");
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

  const pinned = items.filter((n) => n.isPinned);
  const recent = items.filter((n) => !n.isPinned);

  return (
    <section className="flex h-full min-h-0 overflow-hidden">
      <aside
        className={cn(
          "flex w-full flex-col border-r border-border bg-card md:w-[340px] md:shrink-0",
          mobileView === "editor" && "hidden md:flex",
        )}
      >
        <ListHeader
          filter={filter}
          notebooks={notebooksQuery.data ?? []}
          tags={tagsQuery.data ?? []}
          onChange={setFilter}
          onCreate={() => void handleCreate()}
          creating={createNote.isPending}
        />
        <NoteList
          isLoading={notesQuery.isLoading}
          pinned={pinned}
          recent={recent}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setMobileView("editor");
          }}
          notebooks={notebooksQuery.data ?? []}
        />
      </aside>

      <main
        className={cn(
          "flex min-w-0 flex-1 flex-col bg-background",
          mobileView === "list" && "hidden md:flex",
        )}
      >
        {selectedId && selectedQuery.data ? (
          <NoteWorkspace
            key={selectedId}
            note={selectedQuery.data}
            notebooks={notebooksQuery.data ?? []}
            onBack={() => setMobileView("list")}
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
          <EmptyState onCreate={() => void handleCreate()} />
        )}
      </main>
    </section>
  );
}

/* -------------------- List header -------------------- */

interface ListHeaderProps {
  filter: NotesFilter;
  notebooks: Notebook[];
  tags: Tag[];
  onChange: (next: NotesFilter) => void;
  onCreate: () => void;
  creating: boolean;
}

function ListHeader({
  filter,
  notebooks,
  tags,
  onChange,
  onCreate,
  creating,
}: ListHeaderProps) {
  const qc = useQueryClient();
  const activeNotebook = useMemo(() => {
    if (filter.notebookId === "all") return null;
    if (filter.notebookId === "none")
      return { id: "none", name: "Chưa phân loại" };
    return notebooks.find((n) => n.id === filter.notebookId) ?? null;
  }, [filter.notebookId, notebooks]);

  return (
    <header className="border-b border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight">Notes</h1>
          <p className="truncate text-2xs text-muted-foreground">
            {activeNotebook ? activeNotebook.name : "Tất cả"}
            {filter.tag ? ` · #${filter.tag}` : ""}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Lọc"
                aria-label="Lọc"
              >
                <Filter className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Notebook</DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() =>
                  onChange({ ...filter, notebookId: "all", tag: null })
                }
              >
                Tất cả
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  onChange({ ...filter, notebookId: "none", tag: null })
                }
              >
                Chưa phân loại
              </DropdownMenuItem>
              {notebooks.map((nb) => (
                <DropdownMenuItem
                  key={nb.id}
                  onSelect={() =>
                    onChange({ ...filter, notebookId: nb.id, tag: null })
                  }
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      background:
                        nb.color ?? "hsl(var(--muted-foreground))",
                    }}
                  />
                  {nb.name}
                </DropdownMenuItem>
              ))}
              <NotebookCreator />
              {tags.length > 0 && <DropdownMenuSeparator />}
              {tags.length > 0 && <DropdownMenuLabel>Tags</DropdownMenuLabel>}
              {tags.map((tag) => (
                <DropdownMenuItem
                  key={tag.id}
                  onSelect={() => onChange({ ...filter, tag: tag.name })}
                >
                  <span className="text-muted-foreground">#</span>
                  {tag.name}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void api
                        .deleteTag(tag.id)
                        .then(() =>
                          qc.invalidateQueries({ queryKey: ["tags"] }),
                        );
                    }}
                    className="ml-auto text-muted-foreground hover:text-destructive"
                    aria-label="Xóa tag"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={onCreate}
            disabled={creating}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-soft transition hover:brightness-110 disabled:opacity-60"
            title="Tạo ghi chú"
            aria-label="Tạo ghi chú"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative px-3 pb-3">
        <Search className="pointer-events-none absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Tìm trong ghi chú…"
          value={filter.q}
          onChange={(e) => onChange({ ...filter, q: e.target.value })}
          className="h-9 pl-8"
        />
        {filter.q && (
          <button
            type="button"
            onClick={() => onChange({ ...filter, q: "" })}
            className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Xóa"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {(filter.notebookId !== "all" || filter.tag) && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
          {filter.notebookId !== "all" && (
            <Chip
              onClear={() => onChange({ ...filter, notebookId: "all" })}
            >
              {activeNotebook?.name ?? "—"}
            </Chip>
          )}
          {filter.tag && (
            <Chip onClear={() => onChange({ ...filter, tag: null })}>
              #{filter.tag}
            </Chip>
          )}
        </div>
      )}
    </header>
  );
}

function NotebookCreator() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const create = useMutation({
    mutationFn: api.createNotebook,
    onSuccess: () => {
      setName("");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["notebooks"] });
    },
  });

  if (!open) {
    return (
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="text-muted-foreground">Notebook mới</span>
      </DropdownMenuItem>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = name.trim();
        if (n) create.mutate({ name: n });
      }}
      className="flex items-center gap-1 px-2 py-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tên notebook"
        className="h-8 text-xs"
      />
      <Button size="sm" type="submit" disabled={create.isPending}>
        Tạo
      </Button>
    </form>
  );
}

function Chip({
  children,
  onClear,
}: {
  children: React.ReactNode;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
      {children}
      <button
        type="button"
        onClick={onClear}
        className="text-accent-foreground/70 hover:text-accent-foreground"
        aria-label="Xóa lọc"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/* -------------------- Note list -------------------- */

interface NoteListProps {
  pinned: NoteSummary[];
  recent: NoteSummary[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  notebooks: Notebook[];
}

function NoteList({
  pinned,
  recent,
  isLoading,
  selectedId,
  onSelect,
  notebooks,
}: NoteListProps) {
  if (isLoading) {
    return (
      <ul className="flex-1 space-y-2 p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <li
            key={i}
            className="h-20 animate-pulse rounded-lg bg-muted/60"
          />
        ))}
      </ul>
    );
  }
  if (pinned.length === 0 && recent.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Chưa có ghi chú. Nhấn <Plus className="inline h-3.5 w-3.5" /> để tạo.
      </div>
    );
  }

  const notebookById = new Map(notebooks.map((n) => [n.id, n]));

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      {pinned.length > 0 && (
        <Section label="Đã ghim">
          {pinned.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              notebook={n.notebookId ? notebookById.get(n.notebookId) : null}
              active={n.id === selectedId}
              onClick={() => onSelect(n.id)}
            />
          ))}
        </Section>
      )}
      {recent.length > 0 && (
        <Section label="Gần đây">
          {recent.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              notebook={n.notebookId ? notebookById.get(n.notebookId) : null}
              active={n.id === selectedId}
              onClick={() => onSelect(n.id)}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border last:border-0">
      <header className="sticky top-0 z-[1] flex items-center justify-between bg-card/95 px-3 py-1.5 backdrop-blur">
        <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </header>
      <ul>{children}</ul>
    </section>
  );
}

function NoteCard({
  note,
  notebook,
  active,
  onClick,
}: {
  note: NoteSummary;
  notebook?: Notebook | null;
  active: boolean;
  onClick: () => void;
}) {
  const title = note.title || "Chưa có tiêu đề";
  const preview = (note.excerpt ?? "").slice(0, 120);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "block w-full border-l-2 px-3 py-2.5 text-left transition-colors",
          active
            ? "border-l-primary bg-accent/60"
            : "border-l-transparent hover:bg-muted/60",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {note.isPinned && (
              <Pin
                className="h-3 w-3 shrink-0 text-dot-orange"
                aria-hidden
              />
            )}
            <h3 className="truncate text-sm font-medium leading-snug">
              {title}
            </h3>
          </div>
          {preview && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {preview}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
            <time dateTime={note.updatedAt}>
              {formatRelative(note.updatedAt)}
            </time>
            {notebook && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background:
                        notebook.color ?? "hsl(var(--muted-foreground))",
                    }}
                  />
                  {notebook.name}
                </span>
              </>
            )}
            {note.tags.slice(0, 2).map((tag) => (
              <span
                key={tag.id}
                className="rounded-full bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground"
              >
                #{tag.name}
              </span>
            ))}
          </div>
        </div>
      </button>
    </li>
  );
}

/* -------------------- Editor workspace -------------------- */

interface NoteWorkspaceProps {
  note: Note;
  notebooks: Notebook[];
  onSaved: (note: Note) => void;
  onDeleted: () => void;
  onBack: () => void;
}

function NoteWorkspace({
  note,
  notebooks,
  onSaved,
  onDeleted,
  onBack,
}: NoteWorkspaceProps) {
  const qc = useQueryClient();
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
          aria-label="Quay lại"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background:
                    notebooks.find((n) => n.id === notebookId)?.color ??
                    "hsl(var(--muted-foreground))",
                }}
              />
              {notebooks.find((n) => n.id === notebookId)?.name ??
                "Chưa phân loại"}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setNotebookId(null)}>
              Chưa phân loại
            </DropdownMenuItem>
            {notebooks.map((nb) => (
              <DropdownMenuItem
                key={nb.id}
                onSelect={() => setNotebookId(nb.id)}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: nb.color ?? "hsl(var(--muted-foreground))",
                  }}
                />
                {nb.name}
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
            onClick={() => {
              if (window.confirm("Xóa ghi chú này?")) remove.mutate();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Xóa"
            aria-label="Xóa"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="border-b border-border px-4 pb-3 pt-4 md:px-8 md:pt-6">
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Tiêu đề ghi chú"
          className="w-full bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60"
        />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTags(tags.filter((t) => t !== tag))}
              className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground hover:bg-accent/80"
            >
              <span>#{tag}</span>
              <X className="h-3 w-3" />
            </button>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={onTagKey}
            onBlur={() => addTag(tagInput)}
            placeholder="Thêm tag…"
            className="bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        {error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        )}
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
                className="group inline-flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs"
              >
                <Paperclip className="h-3 w-3 text-muted-foreground" />
                <a
                  href={`/api/attachments/${att.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="max-w-[200px] truncate hover:underline"
                >
                  {att.originalName}
                </a>
                <button
                  type="button"
                  onClick={() => removeAttachment.mutate(att.id)}
                  className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
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

function stripHtml(html: string): string {
  if (typeof window === "undefined") return html.replace(/<[^>]*>/g, " ");
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || "").replace(/\s+/g, " ").trim();
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
