import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  ChevronLeft,
  FileText,
  FolderOpen,
  Loader2,
  Lock,
  ShieldAlert,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { SharedNoteView } from "@assistant/shared";
import { NoteEditor } from "../components/editor/note-editor";
import { Button } from "../components/ui/button";
import { ApiError, api } from "../lib/api";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("vi-VN");
  } catch {
    return iso;
  }
}

export function SharedPage() {
  const params = useParams({ strict: false }) as { token?: string };
  const token = params.token ?? "";
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

  const resourceQuery = useQuery({
    queryKey: ["sharedResource", token],
    queryFn: () => api.getSharedResource(token),
    enabled: Boolean(token),
    retry: false,
  });

  const noteQuery = useQuery({
    queryKey: ["sharedNote", token, openNoteId],
    queryFn: () => api.getSharedNote(token, openNoteId as string),
    enabled: Boolean(token && openNoteId),
    retry: false,
  });

  if (resourceQuery.isLoading) {
    return <CenteredLoader />;
  }
  if (resourceQuery.isError || !resourceQuery.data) {
    return <SharedError error={resourceQuery.error} token={token} />;
  }

  const data = resourceQuery.data;

  // Mở một note qua liên kết (mention) hoặc qua danh sách notebook → tải note đó
  // trong phạm vi token. Backend tự enforce quyền: note-share chỉ cho đúng note
  // gốc, notebook-share cho note nằm trong cây notebook đã chia sẻ; ngoài phạm vi
  // trả lỗi và hiện thông báo thân thiện. "Quay lại" về màn chủ (note gốc / danh
  // sách notebook).
  const backLabel =
    data.resourceType === "notebook"
      ? data.notebook.name
      : data.note.title || "Ghi chú";

  return (
    <Shell ownerName={data.ownerName}>
      {openNoteId ? (
        <div className="space-y-4">
          <BackButton label={backLabel} onClick={() => setOpenNoteId(null)} />
          {noteQuery.isLoading ? (
            <CenteredLoader />
          ) : noteQuery.isError || !noteQuery.data ? (
            <SharedError error={noteQuery.error} token={token} embedded />
          ) : (
            <ReadOnlyNote note={noteQuery.data.note} onOpenNote={setOpenNoteId} />
          )}
        </div>
      ) : data.resourceType === "note" ? (
        <ReadOnlyNote note={data.note} onOpenNote={setOpenNoteId} />
      ) : (
        <NotebookList
          name={data.notebook.name}
          notes={data.notes}
          onOpen={setOpenNoteId}
        />
      )}
    </Shell>
  );
}

interface ShellProps {
  ownerName: string;
  children: ReactNode;
}

function Shell({ ownerName, children }: ShellProps) {
  return (
    <div className="min-h-full bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Được chia sẻ bởi{" "}
            <span className="font-medium text-foreground">{ownerName}</span>
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}

interface ReadOnlyNoteProps {
  note: SharedNoteView;
  // Mở một note khác được mention trong nội dung (trong phạm vi cùng token).
  onOpenNote?: (id: string) => void;
}

function ReadOnlyNote({ note, onOpenNote }: ReadOnlyNoteProps) {
  return (
    <article className="space-y-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold leading-tight">
          {note.title || "Không có tiêu đề"}
        </h1>
        <p className="text-xs text-muted-foreground">
          Cập nhật {formatDate(note.updatedAt)}
        </p>
      </div>
      <NoteEditor
        value={note.contentHtml}
        editable={false}
        onChange={() => {}}
        onOpenNote={onOpenNote}
      />
    </article>
  );
}

interface NotebookListProps {
  name: string;
  notes: { id: string; title: string; excerpt: string; updatedAt: string }[];
  onOpen: (id: string) => void;
}

function NotebookList({ name, notes, onOpen }: NotebookListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FolderOpen className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">{name}</h1>
      </div>
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Thư mục này chưa có ghi chú.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => onOpen(note.id)}
                className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-muted/50"
              >
                <span className="flex items-center gap-2 font-medium">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {note.title || "Không có tiêu đề"}
                </span>
                {note.excerpt && (
                  <span className="line-clamp-2 pl-6 text-sm text-muted-foreground">
                    {note.excerpt}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </button>
  );
}

function CenteredLoader() {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

interface SharedErrorProps {
  error: unknown;
  token: string;
  embedded?: boolean;
}

function SharedError({ error, token, embedded }: SharedErrorProps) {
  const navigate = useNavigate();
  const status = error instanceof ApiError ? error.status : 0;
  const needsLogin = status === 401;
  const forbidden = status === 403;

  const goLogin = (): void => {
    try {
      sessionStorage.setItem("postLoginRedirect", `/share/${token}`);
    } catch {
      // sessionStorage không khả dụng — bỏ qua, người dùng sẽ tự mở lại link.
    }
    void navigate({ to: "/login" });
  };

  const body = (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {needsLogin ? (
          <Lock className="h-6 w-6" />
        ) : (
          <ShieldAlert className="h-6 w-6" />
        )}
      </span>
      {needsLogin ? (
        <>
          <h2 className="text-lg font-semibold">Nội dung được chia sẻ riêng</h2>
          <p className="text-sm text-muted-foreground">
            Hãy đăng nhập bằng email đã được mời để xem nội dung này.
          </p>
          <Button type="button" onClick={goLogin}>
            Đăng nhập
          </Button>
        </>
      ) : forbidden ? (
        <>
          <h2 className="text-lg font-semibold">Bạn không có quyền xem</h2>
          <p className="text-sm text-muted-foreground">
            Tài khoản hiện tại không nằm trong danh sách được mời. Hãy liên hệ
            người chia sẻ.
          </p>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold">Liên kết không khả dụng</h2>
          <p className="text-sm text-muted-foreground">
            Liên kết chia sẻ không tồn tại hoặc đã bị thu hồi.
          </p>
        </>
      )}
    </div>
  );

  if (embedded) return <div className="py-8">{body}</div>;
  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4 py-16 text-foreground">
      {body}
    </div>
  );
}
