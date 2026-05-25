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
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { api, ApiError } from "../lib/api";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  return (
    <section className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Cài đặt</h1>
        <p className="text-sm text-muted-foreground">
          Cấu hình AI provider, Telegram, theme.
        </p>
      </header>
      {isLoading && <p className="text-muted-foreground">Đang tải…</p>}
      {data && (
        <SettingsForm
          initial={data}
          onSaved={(s) => queryClient.setQueryData<UserSettings>(["settings"], s)}
        />
      )}
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAiProvider(initial.aiProvider);
    setTheme(initial.theme);
    setTelegramChatId(initial.telegramChatId ?? "");
  }, [initial]);

  const mutation = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: (s) => {
      setAiApiKey("");
      setTelegramBotToken("");
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
