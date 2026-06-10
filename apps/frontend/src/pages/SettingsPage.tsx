import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import {
  aiProviderSchema,
  themeSchema,
  updateSettingsInputSchema,
  type AiProvider,
  type Theme,
  type UpdateSettingsInput,
  type UserSettings,
} from "@assistant/shared";
import { Lock } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useConfirm } from "../components/ui/confirm-dialog";
import { api, ApiError } from "../lib/api";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <section className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Cài đặt</h1>
        <p className="text-sm text-muted-foreground">
          Cấu hình AI provider, Telegram, n8n, theme.
        </p>
      </header>
      {isLoading && <p className="text-muted-foreground">Đang tải…</p>}
      {data && (
        <>
          <SettingsForm
            initial={data}
            onSaved={(s) =>
              queryClient.setQueryData<UserSettings>(["settings"], s)
            }
          />
          <NotesLockSection
            initial={data}
            onSaved={(s) =>
              queryClient.setQueryData<UserSettings>(["settings"], s)
            }
          />
        </>
      )}
      </section>
    </div>
  );
}

interface NotesLockSectionProps {
  initial: UserSettings;
  onSaved: (s: UserSettings) => void;
}

function NotesLockSection({ initial, onSaved }: NotesLockSectionProps) {
  const confirm = useConfirm();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = (): void => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  };

  const setMut = useMutation({
    mutationFn: api.setNotesLock,
    onSuccess: (s) => {
      reset();
      onSaved(s);
    },
    onError: (e: unknown) =>
      setError(e instanceof ApiError ? e.message : "Lưu thất bại"),
  });

  const removeMut = useMutation({
    mutationFn: (password: string) => api.removeNotesLock(password),
    onSuccess: (s) => {
      reset();
      onSaved(s);
    },
    onError: (e: unknown) =>
      setError(e instanceof ApiError ? e.message : "Xóa thất bại"),
  });

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 4) {
      setError("Mật khẩu khóa tối thiểu 4 ký tự");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu nhập lại không khớp");
      return;
    }
    setMut.mutate(
      initial.hasNotesLock ? { currentPassword, newPassword } : { newPassword },
    );
  };

  const onRemove = async (): Promise<void> => {
    setError(null);
    if (!currentPassword) {
      setError("Nhập mật khẩu hiện tại để xóa");
      return;
    }
    const ok = await confirm({
      title: "Xóa mật khẩu khóa?",
      description:
        "Toàn bộ ghi chú và thư mục đang khóa sẽ được mở khóa. Bạn có chắc chắn?",
      confirmText: "Xóa mật khẩu",
      variant: "destructive",
    });
    if (ok) removeMut.mutate(currentPassword);
  };

  const busy = setMut.isPending || removeMut.isPending;

  return (
    <section className="space-y-4 border-t border-border pt-6">
      <header className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-muted-foreground" />
        <div>
          <h2 className="text-base font-semibold">Khóa ghi chú</h2>
          <p className="text-sm text-muted-foreground">
            {initial.hasNotesLock
              ? "Đã đặt mật khẩu khóa. Có thể đổi hoặc xóa bên dưới."
              : "Đặt một mật khẩu khóa để bảo vệ ghi chú và thư mục."}
          </p>
        </div>
      </header>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {initial.hasNotesLock && (
          <div className="space-y-1.5">
            <Label htmlFor="currentNotesLock">Mật khẩu hiện tại</Label>
            <Input
              id="currentNotesLock"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="newNotesLock">
            {initial.hasNotesLock ? "Mật khẩu mới" : "Mật khẩu khóa"}
          </Label>
          <Input
            id="newNotesLock"
            type="password"
            autoComplete="new-password"
            placeholder="Tối thiểu 4 ký tự"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmNotesLock">Nhập lại mật khẩu</Label>
          <Input
            id="confirmNotesLock"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {initial.hasNotesLock ? "Đổi mật khẩu" : "Đặt mật khẩu khóa"}
          </Button>
          {initial.hasNotesLock && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void onRemove()}
            >
              Xóa mật khẩu khóa
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}

interface SettingsFormProps {
  initial: UserSettings;
  onSaved: (s: UserSettings) => void;
}

function SettingsForm({ initial, onSaved }: SettingsFormProps) {
  const [aiProvider, setAiProvider] = useState<AiProvider>(initial.aiProvider);
  const [theme, setTheme] = useState<Theme>(initial.theme);
  const [aiApiKey, setAiApiKey] = useState("");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState(
    initial.telegramChatId ?? "",
  );
  const [n8nBaseUrl, setN8nBaseUrl] = useState(initial.n8nBaseUrl ?? "");
  const [n8nApiKey, setN8nApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAiProvider(initial.aiProvider);
    setTheme(initial.theme);
    setTelegramChatId(initial.telegramChatId ?? "");
    setN8nBaseUrl(initial.n8nBaseUrl ?? "");
  }, [initial]);

  const mutation = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: (s) => {
      setAiApiKey("");
      setTelegramBotToken("");
      setN8nApiKey("");
      onSaved(s);
    },
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const patch: UpdateSettingsInput = { aiProvider, theme };
    if (aiApiKey.length > 0) patch.aiApiKey = aiApiKey;
    if (telegramBotToken.length > 0) patch.telegramBotToken = telegramBotToken;
    if ((initial.telegramChatId ?? "") !== telegramChatId)
      patch.telegramChatId = telegramChatId || null;
    if ((initial.n8nBaseUrl ?? "") !== n8nBaseUrl.trim())
      patch.n8nBaseUrl = n8nBaseUrl.trim() || null;
    if (n8nApiKey.trim().length > 0) patch.n8nApiKey = n8nApiKey.trim();
    const parsed = updateSettingsInputSchema.safeParse(patch);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      return;
    }
    try {
      await mutation.mutateAsync(parsed.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lưu thất bại");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="aiProvider">AI provider</Label>
        <select
          id="aiProvider"
          value={aiProvider}
          onChange={(e) => setAiProvider(e.target.value as AiProvider)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {aiProviderSchema.options.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="aiApiKey">
          AI API key{" "}
          {initial.aiApiKeyMasked && (
            <span className="text-xs text-muted-foreground">
              (hiện tại: {initial.aiApiKeyMasked})
            </span>
          )}
        </Label>
        <Input
          id="aiApiKey"
          type="password"
          placeholder="Để trống nếu không đổi"
          value={aiApiKey}
          onChange={(e) => setAiApiKey(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="telegramBotToken">
          Telegram bot token{" "}
          {initial.telegramBotTokenMasked && (
            <span className="text-xs text-muted-foreground">
              (hiện tại: {initial.telegramBotTokenMasked})
            </span>
          )}
        </Label>
        <Input
          id="telegramBotToken"
          type="password"
          placeholder="123456:ABC-DEF…"
          value={telegramBotToken}
          onChange={(e) => setTelegramBotToken(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="telegramChatId">Telegram chat_id</Label>
        <Input
          id="telegramChatId"
          value={telegramChatId}
          onChange={(e) => setTelegramChatId(e.target.value)}
        />
      </div>

      <div className="space-y-4 rounded-lg border border-border p-4">
        <div>
          <h2 className="text-base font-semibold">n8n — Quản lý Workflow Exc</h2>
          <p className="text-sm text-muted-foreground">
            Dùng để xem, retry &amp; xóa executions từ view Jobs. Tạo API key
            trong n8n: Settings → n8n API (scope execution + workflow).
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="n8nBaseUrl">Base URL</Label>
          <Input
            id="n8nBaseUrl"
            type="url"
            placeholder="https://n8n.nghiepdev.info"
            value={n8nBaseUrl}
            onChange={(e) => setN8nBaseUrl(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="n8nApiKey">
            API key{" "}
            {initial.n8nApiKeyMasked && (
              <span className="text-xs text-muted-foreground">
                (hiện tại: {initial.n8nApiKeyMasked})
              </span>
            )}
          </Label>
          <Input
            id="n8nApiKey"
            type="password"
            placeholder="Dán n8n API key (header X-N8N-API-KEY)"
            value={n8nApiKey}
            onChange={(e) => setN8nApiKey(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="theme">Theme</Label>
        <select
          id="theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value as Theme)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {themeSchema.options.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Đang lưu…" : "Lưu thay đổi"}
      </Button>
    </form>
  );
}
